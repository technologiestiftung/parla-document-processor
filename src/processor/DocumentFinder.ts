import { SupabaseClient } from "@supabase/supabase-js";
import {
	ProcessedDocument,
	RegisteredDocument,
	Settings,
} from "../interfaces/Common.js";

export class DocumentFinder {
	static async find(
		supabase: SupabaseClient<any, "public", any>,
		settings: Settings,
	): Promise<Array<RegisteredDocument>> {
		// First: cleanup unsuccessfully processed documents
		if (settings.allowDeletion) {
			const {
				data: processedDocumentsToCleanup,
				error: processedDocumentsToCleanupError,
			} = await supabase
				.rpc("find_registered_documents_with_errors")
				.select("*");

			if (processedDocumentsToCleanupError) {
				throw new Error(
					`Error finding registered documents with errors: ${processedDocumentsToCleanupError.message}`,
				);
			}

			await Promise.all(
				(processedDocumentsToCleanup ?? []).map(async (p) => {
					await supabase.from("processed_documents").delete().eq("id", p.id);
				}),
			);
		}

		const { data, error } = await supabase
			.rpc("find_unprocessed_registered_documents", {})
			.select("*");

		console.log(data?.length, error);

		if (error) {
			throw new Error(
				`Error finding unprocessed registered documents: ${error.message}`,
			);
		}

		console.log(`Found ${data.length} unprocessed registered documents.`);
		return data;
	}
}
