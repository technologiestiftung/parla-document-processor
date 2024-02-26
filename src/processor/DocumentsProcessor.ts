import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { Configuration, OpenAIApi } from "openai";
import postgres from "postgres";
import {
	EmbeddingResult,
	ExtractRequest,
	ExtractionResult,
	RegisteredDocument,
	ProcessedDocumentChunk,
	ProcessedDocument,
	Settings,
	SummarizeResult,
} from "../interfaces/Common.js";
import { DocumentEmbeddor } from "./DocumentEmbeddor.js";
import { DocumentExtractor } from "./DocumentExtractor.js";
import { DocumentSummarizor } from "./DocumentSummarizor.js";
import { DocumentFinder } from "./DocumentFinder.js";

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
			settings.supabaseServiceRoleKey,
		);
		this.openAi = new OpenAIApi(
			new Configuration({
				apiKey: settings.openaAiApiKey,
			}),
		);
	}

	async find(): Promise<Array<RegisteredDocument>> {
		const documents = await DocumentFinder.find(this.supabase, this.settings);
		return documents;
	}

	async extract(document: RegisteredDocument): Promise<ExtractionResult> {
		const extractionResult = await DocumentExtractor.extract(
			{
				document: document,
				targetPath: this.settings.processingDirectory,
			} as ExtractRequest,
			this.settings,
		);

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

	async regenerateChunksEmbeddings(
		registeredDocument: RegisteredDocument,
	): Promise<EmbeddingResult> {
		const { data: processedDoc, error: processedDocError } = await this.supabase
			.from("processed_documents")
			.select("*")
			.eq("registered_document_id", registeredDocument.id)
			.single<ProcessedDocument>();

		const { data: processedDocChunks, error: processedDocChunksError } =
			await this.supabase
				.from("processed_document_chunks")
				.select("*")
				.eq("processed_document_id", processedDoc!.id)
				.returns<Array<ProcessedDocumentChunk>>();

		console.log(`found ${processedDocChunks?.length} chunks`);
		const embeddingResult = await DocumentEmbeddor.regenerateEmbeddings(
			registeredDocument,
			processedDoc,
			processedDocChunks!,
			this.openAi,
		);

		console.log(`regenerated ${embeddingResult.embeddings.length} chunks`);

		await Promise.all(
			embeddingResult.embeddings.map(async (embedding) => {
				const { data, error } = await this.supabase
					.from("processed_document_chunks")
					.update({
						// Attention: This is by design, not a mistake.
						// We assign embedding to embedding_old in the database
						// and vice versa. The final switch from old embedding to new embedding
						// can then be done with a database update statement, before / at the same time
						// the API is updated to also use the new embedding. This way we avoid
						// that API embeddings and database embeddings are out of sync.
						embedding: embedding.embeddingOld,
						embedding_old: embedding.embedding,
					})
					.eq("id", embedding.id);
				console.log(data, error);
			}),
		);

		return embeddingResult;
	}

	async finish(processedDocument: ProcessedDocument) {
		const { data, error } = await this.supabase
			.from("processed_documents")
			.update({ processing_finished_at: new Date() })
			.eq("id", processedDocument.id);
	}

	async finishWithError(
		processedDocument: ProcessedDocument,
		errorMessage: string,
	) {
		const { data, error } = await this.supabase
			.from("processed_documents")
			.update({
				processing_finished_at: new Date(),
				processing_error: errorMessage,
			})
			.eq("id", processedDocument.id);
	}
}
