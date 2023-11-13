import { SupabaseClient, createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { Settings } from "../../interfaces/Settings.js";
import { DocumentImporter } from "../../interfaces/DocumentImporter.js";
import { parseXML2JSON } from "./ParseXmlToJson.js";

export class SchrAnfrImporter implements DocumentImporter {
	documentType: string = "Schriftliche Anfrage";
	pardokSourceUrl: string =
		"https://www.parlament-berlin.de/opendata/pardok-wp19.xml";

	settings: Settings;
	sql: postgres.Sql<{}>;
	supabase: SupabaseClient<any, "public", any>;

	constructor(settings: Settings) {
		this.settings = settings;
		this.sql = postgres(settings.postgresConnection);
		this.supabase = createClient(
			settings.supabaseUrl,
			settings.supabaseAnonKey,
		);
	}

	async import(): Promise<number> {
		const xmlRes = await fetch(this.pardokSourceUrl);
		const xml = await xmlRes.text();
		const pardok = await parseXML2JSON(xml);
		const vorgangs = pardok.Export.Vorgang.filter((v) => {
			return (
				!v.VFunktion || v.VFunktion.length === 0 || v.VFunktion[0] !== "delete"
			);
		});
		const documentsInPardok = vorgangs
			.flatMap((v) => v.Dokument)
			.filter((d) => d.LokURL && d.DokTyp)
			.filter((d) => d.DokTyp[0] === "SchrAnfr");

		const documentsInDatabase = await this
			.sql`SELECT * FROM registered_documents where source_type = ${this.documentType}`;

		console.log(
			`${documentsInPardok.length} documents in source for "${this.documentType}"...`,
		);
		console.log(
			`${documentsInDatabase.length} documents already registered in database...`,
		);

		const remoteDocumentsToDelete = documentsInDatabase.filter((rd) => {
			return (
				documentsInPardok.filter((d) => d.LokURL[0] === rd.source_url)
					.length === 0
			);
		});

		const localDocumentsToAdd = documentsInPardok.filter((ld) => {
			return (
				documentsInDatabase.filter((rd) => rd.source_url === ld.LokURL[0])
					.length === 0
			);
		});

		console.log(
			`${remoteDocumentsToDelete.length} "${this.documentType}" documents to delete from database...`,
		);
		console.log(
			`${localDocumentsToAdd.length} "${this.documentType}" documents to add to database...`,
		);

		try {
			await this.supabase
				.from("registered_documents")
				.delete()
				.in(
					"id",
					remoteDocumentsToDelete.map((d) => d.id),
				);

			const values = localDocumentsToAdd.map((d) => {
				return {
					source_type: this.documentType,
					source_url: d.LokURL[0],
					metadata: d,
					registered_at: new Date(),
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
