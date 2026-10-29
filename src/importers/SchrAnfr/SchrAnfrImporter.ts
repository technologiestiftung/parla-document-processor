import { SupabaseClient, createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { parseXML2JSON } from "./ParseXmlToJson.js";
import { Dokument } from "./SchrAnfrTypes.js";
import { DocumentImporter, Settings } from "../../interfaces/Common.js";
import { ELECTORAL_TERMS } from "../ElectoralTerms.js";

export class SchrAnfrImporter implements DocumentImporter {
	documentType: string = "Schriftliche Anfrage";

	settings: Settings;
	sql: postgres.Sql<{}>;
	supabase: SupabaseClient<any, "public", any>;

	constructor(settings: Settings) {
		this.settings = settings;
		this.sql = postgres(settings.postgresConnection);
		this.supabase = createClient(
			settings.supabaseUrl,
			settings.supabaseServiceRoleKey,
		);
	}

	async fetchDocuments(electoralTerm: number): Promise<Array<Dokument>> {
		const pardokSourceUrl = `https://www.parlament-berlin.de/opendata/pardok-wp${electoralTerm}.xml`;
		const xmlRes = await fetch(pardokSourceUrl);
		if (!xmlRes.ok) {
			throw new Error(
				`${pardokSourceUrl} responded with status ${xmlRes.status}`,
			);
		}
		const xml = await xmlRes.text();
		const pardok = await parseXML2JSON(xml);
		const vorgangs = pardok.Export.Vorgang.filter((v) => {
			return (
				!v.VFunktion || v.VFunktion.length === 0 || v.VFunktion[0] !== "delete"
			);
		});
		const documents = vorgangs
			.flatMap((v) => v.Dokument)
			.filter((d) => d.LokURL && d.DokTyp)
			.filter((d) => d.DokTyp[0] === "SchrAnfr");
		// An empty source is treated as an error, otherwise all documents of the
		// electoral term would be deleted from the database (if ALLOW_DELETION=true)
		if (documents.length === 0) {
			throw new Error(`${pardokSourceUrl} contains no documents`);
		}
		return documents;
	}

	async import(): Promise<number> {
		let documentsInPardok: Array<Dokument> = [];
		const electoralTermBySourceUrl = new Map<string, number>();
		for (const electoralTerm of ELECTORAL_TERMS) {
			const documentsOfTerm = await this.fetchDocuments(electoralTerm);
			console.log(
				`${documentsOfTerm.length} documents in source for "${this.documentType}" in electoral term ${electoralTerm}...`,
			);
			documentsOfTerm.forEach(({ LokURL }) =>
				electoralTermBySourceUrl.set(LokURL[0], electoralTerm),
			);
			documentsInPardok = documentsInPardok.concat(documentsOfTerm);
		}

		// Limit the number of documents to import. This is done for testing and staging
		// environment where we do not want the imported documents to grow.
		// -1 means do not set a limit.
		if (this.settings.maxDocumentsToImportPerDocumentType > -1) {
			documentsInPardok = documentsInPardok.slice(
				0,
				this.settings.maxDocumentsToImportPerDocumentType,
			);
		}

		const documentsInDatabase = await this
			.sql`SELECT * FROM registered_documents where source_type = ${this.documentType}`;

		console.log(
			`${documentsInPardok.length} documents in source for "${this.documentType}"...`,
		);
		console.log(
			`${documentsInDatabase.length} documents already registered in database...`,
		);

		const localDocumentsToAdd = documentsInPardok.filter((ld) => {
			return (
				documentsInDatabase.filter((rd) => rd.source_url === ld.LokURL[0])
					.length === 0
			);
		});

		try {
			// delete only if explicitly allowed
			if (this.settings.allowDeletion) {
				// only delete documents of electoral terms imported in this run, otherwise
				// all documents of an electoral term removed from ELECTORAL_TERMS would be deleted
				const remoteDocumentsToDelete = documentsInDatabase.filter((rd) => {
					return (
						ELECTORAL_TERMS.includes(rd.electoral_term) &&
						documentsInPardok.filter((d) => d.LokURL[0] === rd.source_url)
							.length === 0
					);
				});
				console.log(
					`${remoteDocumentsToDelete.length} "${this.documentType}" documents to delete from database...`,
				);
				await this.supabase
					.from("registered_documents")
					.delete()
					.in(
						"id",
						remoteDocumentsToDelete.map((d) => d.id),
					);
			}

			// insert new documents
			console.log(
				`${localDocumentsToAdd.length} "${this.documentType}" documents to add to database...`,
			);
			const values = localDocumentsToAdd.map((d) => {
				return {
					source_type: this.documentType,
					source_url: d.LokURL[0],
					metadata: d,
					registered_at: new Date(),
					electoral_term: electoralTermBySourceUrl.get(d.LokURL[0]),
				};
			});

			await this.supabase.from("registered_documents").insert(values);
		} catch (e) {
			console.log(e);
			process.exit(1);
		}

		return 1;
	}
}
