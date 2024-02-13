import { SupabaseClient, createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { DocumentImporter, Settings } from "../../interfaces/Common.js";

export class WebResourcesImporter implements DocumentImporter {
	documentType: string = "Webseite";
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

	async import(): Promise<number> {
		const { data, error } = await this.supabase
			.from("external_sources")
			.select("*");

		const localDocuments = data ?? [];

		const documentsInDatabase = await this
			.sql`SELECT * FROM registered_documents where source_type = ${this.documentType}`;

		const localDocumentsToAdd = localDocuments.filter((ld) => {
			return (
				documentsInDatabase.filter((dd) => {
					return ld.source_url === dd.source_url;
				}).length === 0
			);
		});

		console.log(
			`${localDocuments.length} documents in source for "${this.documentType}"...`,
		);
		console.log(
			`${documentsInDatabase.length} documents already registered in database...`,
		);

		console.log(
			`${localDocumentsToAdd.length} "${this.documentType}" documents to add to database...`,
		);

		// delete only if expliclty allowed
		if (this.settings.allowDeletion) {
			const remoteDocumentsToDelete = documentsInDatabase.filter((rd) => {
				return (
					localDocuments.filter((ld) => {
						return ld.source_url === rd.source_url;
					}).length === 0
				);
			});

			console.log(
				`${remoteDocumentsToDelete.length} "${this.documentType}" remote documents to delete from database...`,
			);

			await Promise.all(
				remoteDocumentsToDelete.map(
					async (rd) =>
						await this.supabase
							.from("registered_documents")
							.delete()
							.eq("id", rd.id),
				),
			);
		}

		// insert documents
		const values = localDocumentsToAdd.map((ld) => {
			return {
				source_type: this.documentType,
				source_url: ld.source_url,
				metadata: ld,
				registered_at: new Date(),
			};
		});

		await this.supabase.from("registered_documents").insert(values);

		return 1;
	}
}
