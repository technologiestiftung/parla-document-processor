import { SupabaseClient } from "@supabase/supabase-js";
import {
	ProcessedDocument,
	RegisteredDocument,
	Settings,
} from "../interfaces/Common.js";
import { fetchAllRegisteredDocuments } from "../utils/utils.js";

export class DocumentFinder {
	static async find(
		supabase: SupabaseClient<any, "public", any>,
		settings: Settings,
	): Promise<Array<RegisteredDocument>> {
		const data = await fetchAllRegisteredDocuments(supabase);

		// First: cleanup unsuccessfully processed documents
		if (settings.allowDeletion) {
			const unsuccessfullyProcessedRegisteredDocuments = (data ?? []).filter(
				(d) => {
					const processedButUnsuccessful =
						d.processed_documents.filter(
							(pd: ProcessedDocument) =>
								(pd.processing_started_at && !pd.processing_finished_at) ||
								!pd.processing_started_at,
						).length > 0;

					return processedButUnsuccessful;
				},
			);

			const processedDocumentsToCleanup =
				unsuccessfullyProcessedRegisteredDocuments.flatMap(
					(d) => d.processed_documents,
				);

			console.log(
				`Found ${unsuccessfullyProcessedRegisteredDocuments.length} unsuccessfully processed documents. Cleanup ${processedDocumentsToCleanup.length} processed documents...`,
			);

			await Promise.all(
				processedDocumentsToCleanup.map(async (p) => {
					await supabase.from("processed_documents").delete().eq("id", p.id);
				}),
			);
		}

		let updatedData = data;
		if (settings.allowDeletion) {
			const updatedDataAfterDeletion = await fetchAllRegisteredDocuments(
				supabase,
			);
			updatedData = updatedDataAfterDeletion ?? [];
		}

		const unprocessedRegisteredDocuments = (updatedData ?? []).filter((d) => {
			const unprocessed = d.processed_documents.length === 0;

			const processedButUnsuccessful =
				d.processed_documents.filter(
					(pd: ProcessedDocument) =>
						(pd.processing_started_at && !pd.processing_finished_at) ||
						!pd.processing_started_at,
				).length > 0;

			return unprocessed || processedButUnsuccessful;
		});

		console.log(
			`Found ${unprocessedRegisteredDocuments.length} unprocessed documents...`,
		);

		return unprocessedRegisteredDocuments.map((d) => {
			const document: any = { ...d };
			delete document.processed_documents;
			const registeredDocument: RegisteredDocument = { ...document };
			return registeredDocument;
		});
	}
}
