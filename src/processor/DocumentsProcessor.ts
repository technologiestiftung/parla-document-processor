import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { Configuration, OpenAIApi } from "openai";
import postgres from "postgres";
import {
	EmbeddingResult,
	ExtractRequest,
	ExtractionResult,
	ProcessedDocument,
	RegisteredDocument,
	Settings,
	SummarizeResult,
} from "../interfaces/Common.js";
import { DocumentEmbeddor } from "./DocumentEmbeddor.js";
import { DocumentExtractor } from "./DocumentExtractor.js";
import { DocumentSummarizor } from "./DocumentSummarizor.js";

export class DocumentsProcessor {
	settings: Settings;
	sql: postgres.Sql<{}>;
	supabase: SupabaseClient<any, "public", any>;
	openAi: OpenAIApi;

	constructor(settings: Settings) {
		this.settings = settings;
		this.sql = postgres(settings.postgresConnection);
		this.supabase = createClient(
			settings.supabaseUrl,
			settings.supabaseAnonKey,
		);
		this.openAi = new OpenAIApi(
			new Configuration({
				apiKey: settings.openaAiApiKey,
			}),
		);
	}

	async find(): Promise<Array<RegisteredDocument>> {
		const { data, error } = await this.supabase
			.from("registered_documents")
			.select(
				"id, source_url, source_type, registered_at, metadata, processed_documents(*)",
			);

		const unprocessedDocuments = (data ?? []).filter((d) => {
			const unprocessed = d.processed_documents.length === 0;

			const processedButUnsuccessful =
				d.processed_documents.filter(
					(pd: ProcessedDocument) =>
						(pd.processing_started_at &&
							pd.processing_finished_at &&
							pd.processing_error) ||
						(pd.processing_started_at && !pd.processing_finished_at) ||
						!pd.processing_started_at,
				).length > 0;

			return unprocessed || processedButUnsuccessful;
		});

		const processedDocumentsToCleanup = unprocessedDocuments.flatMap(
			(d) => d.processed_documents,
		);

		console.log(`found ${unprocessedDocuments.length} unprocessed documents`);
		console.log(
			`cleanup ${processedDocumentsToCleanup.length} processed documents`,
		);

		await Promise.all(
			processedDocumentsToCleanup.map(async (p) => {
				await this.supabase.from("processed_documents").delete().eq("id", p.id);
			}),
		);

		return unprocessedDocuments.map((d) => {
			const document: any = { ...d };
			delete document.processed_documents;
			const registeredDocument: RegisteredDocument = { ...document };
			return registeredDocument;
		});
	}

	async extract(document: RegisteredDocument): Promise<ExtractionResult> {
		const extractionResult = await DocumentExtractor.extract({
			document: document,
			targetPath: this.settings.processingDirectory,
		} as ExtractRequest);

		const { data } = await this.supabase
			.from("processed_documents")
			.insert({
				file_checksum: extractionResult.checksum,
				file_size: extractionResult.fileSize,
				num_pages: extractionResult.numPages,
				processing_started_at: new Date(),
				registered_document_id: extractionResult.document.id,
			})
			.select("*");

		return { ...extractionResult, processedDocument: data![0] };
	}

	async summarize(
		extractionResult: ExtractionResult,
	): Promise<SummarizeResult> {
		const summary = await DocumentSummarizor.summarize(
			extractionResult,
			this.openAi,
		);
		const { data, error } = await this.supabase
			.from("processed_document_summaries")
			.insert({
				summary: summary.summary,
				summary_embedding: summary.embedding,
				tags: summary.tags,
				processed_document_id: summary.processedDocument.id,
			});
		return summary;
	}

	async embedd(extractionResult: ExtractionResult): Promise<EmbeddingResult> {
		const embeddingResult = await DocumentEmbeddor.embedd(
			extractionResult,
			this.openAi,
		);

		const { data, error } = await this.supabase
			.from("processed_document_chunks")
			.insert(
				embeddingResult.embeddings.map((e) => {
					return {
						content: e.content,
						embedding: e.embedding,
						page: e.page,
						chunk_index: e.chunkIndex,
						processed_document_id: embeddingResult.processedDocument.id,
					};
				}),
			);

		return embeddingResult;
	}

	async finish(extractionResult: ExtractionResult) {
		const { data, error } = await this.supabase
			.from("processed_documents")
			.update({ processing_finished_at: new Date() })
			.eq("id", extractionResult.processedDocument!.id);
	}

	async finishWithError(
		extractionResult: ExtractionResult,
		errorMessage: string,
	) {
		const { data, error } = await this.supabase
			.from("processed_documents")
			.update({
				processing_finished_at: new Date(),
				processing_error: errorMessage,
			})
			.eq("id", extractionResult.processedDocument!.id);
	}
}
