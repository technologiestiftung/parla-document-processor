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
		// An export without any Vorgang (e.g. of a new electoral term) has no Vorgang key
		const vorgangs = (pardok.Export.Vorgang ?? []).filter((v) => {
			return (
				!v.VFunktion || v.VFunktion.length === 0 || v.VFunktion[0] !== "delete"
			);
		});
		return vorgangs
			.flatMap((v) => v.Dokument)
			.filter((d) => d.LokURL && d.DokTyp)
			.filter((d) => d.DokTyp[0] === "SchrAnfr");
	}

	async import(): Promise<number> {
		let documentsInPardok: Array<Dokument> = [];
		const electoralTermBySourceUrl = new Map<string, number>();
		const emptyElectoralTerms: Array<number> = [];
		for (const electoralTerm of ELECTORAL_TERMS) {
			const documentsOfTerm = await this.fetchDocuments(electoralTerm);
			console.log(
				`${documentsOfTerm.length} documents in source for "${this.documentType}" in electoral term ${electoralTerm}...`,
			);
			if (documentsOfTerm.length === 0) {
				console.warn(
					`WARNING: No documents in source for "${this.documentType}" in electoral term ${electoralTerm}...`,
				);
				emptyElectoralTerms.push(electoralTerm);
			}
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

		// An empty source is fine for a new electoral term without documents yet. If the
		// database already has documents of that term, the source is broken: fail instead
		// of deleting all of them (if ALLOW_DELETION=true)
		const brokenElectoralTerms = emptyElectoralTerms.filter((electoralTerm) =>
			documentsInDatabase.some(
				({ electoral_term }) => electoral_term === electoralTerm,
			),
		);
		if (brokenElectoralTerms.length > 0) {
			throw new Error(
				`No documents in source for "${this.documentType}" in electoral terms ${brokenElectoralTerms.join(", ")}, but documents of them in database`,
			);
		}

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
