import { SupabaseClient, createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { Settings } from "../../interfaces/Settings.js";
import { DocumentImporter } from "../../interfaces/DocumentImporter.js";

export class RedNumberImporter implements DocumentImporter {
	documentType: string = "Hauptausschussprotokoll";
	apiEndpoint: string = "https://www.parlament-berlin.de/api/v1";
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

	async getTotalNumberOfPages(): Promise<number> {
		var formdata = new FormData();
		formdata.append("electoralTerm", "19");
		formdata.append("committee", "haupt-ausschuss.nsf");
		formdata.append("status", "Erledigt");
		var requestOptions = {
			method: "POST",
			body: formdata,
		};
		const totalPagesRes = await fetch(
			"https://www.parlament-berlin.de/api/v1/documents/processes",
			requestOptions,
		);
		const totalPagesJsonRes = await totalPagesRes.json();
		const totalPages = Math.ceil(
			totalPagesJsonRes.paginator.total / totalPagesJsonRes.paginator.pageSize,
		);
		return totalPages;
	}

	async import(): Promise<number> {
		const totalPages = await this.getTotalNumberOfPages();
		let localDocuments: Array<any> = [];
		for (let page = 1; page <= totalPages; page++) {
			var formdata = new FormData();
			formdata.append("electoralTerm", "19");
			formdata.append("committee", "haupt-ausschuss.nsf");
			formdata.append("startIndex", page.toString());
			formdata.append("status", "Erledigt");
			var requestOptions = {
				method: "POST",
				body: formdata,
			};
			const res = await fetch(
				"https://www.parlament-berlin.de/api/v1/documents/processes",
				requestOptions,
			);
			const jsonRes = await res.json();
			for (let index = 0; index < jsonRes.items.length; index++) {
				const item = jsonRes.items[index];
				const relevantDocs = item.description.docs.filter(
					(doc: any) =>
						doc.href.includes("-v") && !doc.href.includes("?open&login"),
				);
				if (relevantDocs.length > 0) {
					relevantDocs.forEach((doc: any) => {
						const description = { ...item.description };
						delete description.docs;
						const processMetadata = { ...item };
						delete processMetadata.description;
						delete processMetadata.protocols;
						localDocuments.push({ ...doc, ...description, ...processMetadata });
					});
				}
			}
		}

		const documentsInDatabase = await this
			.sql`SELECT * FROM registered_documents where source_type = ${this.documentType}`;

		const remoteDocumentsToDelete = documentsInDatabase.filter((rd) => {
			return (
				localDocuments.filter((ld) => {
					return ld.href === rd.source_url;
				}).length === 0
			);
		});

		const localDocumentsToAdd = localDocuments.filter((ld) => {
			return (
				documentsInDatabase.filter((dd) => {
					return ld.href === dd.source_url;
				}).length === 0
			);
		});

		console.log(`${remoteDocumentsToDelete.length} remote documents to delete`);
		console.log(`${localDocumentsToAdd.length} local documents to add`);

		await Promise.all(
			remoteDocumentsToDelete.map(
				async (rd) =>
					await this.supabase
						.from("registered_documents")
						.delete()
						.eq("id", rd.id),
			),
		);

		const values = localDocumentsToAdd.map((ld) => {
			return {
				source_type: this.documentType,
				source_url: ld.href,
				metadata: ld,
				registered_at: new Date(),
			};
		});

		await this.supabase.from("registered_documents").insert(values);

		return 1;
	}
}
