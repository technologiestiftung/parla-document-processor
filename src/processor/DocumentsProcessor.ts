import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";
import postgres from "postgres";
import {
	ExtractRequest,
	ExtractionResult,
	ProcessedDocument,
	ProcessedDocumentSummary,
	RegisteredDocument,
	Settings,
} from "../interfaces/Common.js";
import { splitArrayEqually } from "../utils/utils.js";
import { DocumentEmbeddor } from "./DocumentEmbeddor.js";
import { DocumentExtractor } from "./DocumentExtractor.js";
import { DocumentFinder } from "./DocumentFinder.js";
import { DocumentSummarizor } from "./DocumentSummarizor.js";

export class DocumentsProcessor {
	settings: Settings;
	sql: postgres.Sql;
	supabase: SupabaseClient;
	openAi: OpenAI;

	constructor(settings: Settings) {
		this.settings = settings;
		this.sql = postgres(settings.postgresConnection);
		this.supabase = createClient(
			settings.supabaseUrl,
			settings.supabaseServiceRoleKey,
		);
		this.openAi = new OpenAI({ apiKey: settings.openaAiApiKey });
	}

	async find() {
		const documents = await DocumentFinder.find(this.supabase, this.settings);
		return documents;
	}

	async extract(document: RegisteredDocument) {
		const extractionResult = await DocumentExtractor.extract(
			{
				document: document,
				targetPath: this.settings.processingDirectory,
			} as ExtractRequest,
			this.settings,
		);

		const { data, error } = await this.supabase
			.from("processed_documents")
			.insert({
				file_checksum: extractionResult.checksum,
				file_size: extractionResult.fileSize,
				num_pages: extractionResult.numPages,
				processing_started_at: new Date(),
				registered_document_id: extractionResult.document.id,
			})
			.select("*");

		if (error) {
			throw new Error(`Error inserting processed document: ${error.message}`);
		}

		return { ...extractionResult, processedDocument: data![0] };
	}

	async summarize(extractionResult: ExtractionResult) {
		const summary = await DocumentSummarizor.summarize(
			extractionResult,
			this.openAi,
		);
		const { error } = await this.supabase
			.from("processed_document_summaries")
			.insert({
				summary: summary.summary,
				summary_embedding: summary.embedding,
				tags: summary.tags,
				processed_document_id: summary.processedDocument.id,
			});

		if (error) {
			throw new Error(
				`Error inserting processed document summary: ${error.message}`,
			);
		}
		return summary;
	}

	async embedd(extractionResult: ExtractionResult) {
		const embeddingResult = await DocumentEmbeddor.embedd(
			extractionResult,
			this.openAi,
		);

		const { error } = await this.supabase
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

		if (error) {
			throw new Error(
				`Error inserting processed document embeddings: ${error.message}`,
			);
		}

		return embeddingResult;
	}

	async regenerateChunksEmbeddings(registeredDocument: RegisteredDocument) {
		const { data: processedDoc } = await this.supabase
			.from("processed_documents")
			.select("*")
			.eq("registered_document_id", registeredDocument.id)
			.single<ProcessedDocument>();

		const { data: processedDocChunks } = await this.supabase
			.from("processed_document_chunks")
			.select("*")
			.eq("processed_document_id", processedDoc!.id)
			.is("embedding_temp", null);

		console.log(
			`found ${processedDocChunks?.length} chunks withot new embeddings`,
		);
		const embeddingResult =
			await DocumentEmbeddor.regenerateEmbeddingsForChunks(
				registeredDocument,
				processedDoc!,
				processedDocChunks!,
				this.openAi,
			);

		const embeddingBatchSize = 10;
		const embeddingBatches = splitArrayEqually(
			embeddingResult.embeddings,
			embeddingBatchSize,
		);
		console.log(
			`Uploading ${embeddingResult.embeddings.length} embeddings to db...`,
		);
		for (let index = 0; index < embeddingBatches.length; index++) {
			console.log(`Uploading batch ${index} of ${embeddingBatches.length}...`);
			const embeddingBatch = embeddingBatches[index];
			await Promise.all(
				embeddingBatch.map(async (embedding) => {
					await this.supabase
						.from("processed_document_chunks")
						.update({
							// The final switch from old embedding to new embedding
							// can then be done with a database update statement, before / at the same time
							// the API is updated to also use the new embedding. This way we avoid
							// that API embeddings and database embeddings are out of sync.
							embedding_temp: embedding.embeddingTemp,
						})
						.eq("id", embedding.id);
				}),
			);
		}

		return embeddingResult;
	}

	async regenerateSummaryEmbeddings(registeredDocument: RegisteredDocument) {
		const { data: processedDoc } = await this.supabase
			.from("processed_documents")
			.select("*")
			.eq("registered_document_id", registeredDocument.id)
			.single<ProcessedDocument>();

		const { data: processedDocSummary } = await this.supabase
			.from("processed_document_summaries")
			.select("*")
			.eq("processed_document_id", processedDoc!.id)
			.is("summary_embedding_temp", null)
			.returns<ProcessedDocumentSummary[]>();

		console.log(
			`found ${(
				processedDocSummary ?? []
			).length.toString()} summaries without new embeddings`,
		);

		if (processedDocSummary && processedDocSummary.length > 0) {
			const summary = processedDocSummary![0];
			const embeddingResult =
				await DocumentEmbeddor.regenerateEmbeddingsForSummary(
					summary,
					this.openAi,
				);

			await this.supabase
				.from("processed_document_summaries")
				.update({
					// The final switch from old embedding to new embedding
					// can then be done with a database update statement, before / at the same time
					// the API is updated to also use the new embedding. This way we avoid
					// that API embeddings and database embeddings are out of sync.
					summary_embedding_temp: embeddingResult.embedding,
				})
				.eq("id", summary.id);
			return embeddingResult;
		} else {
			return { embedding: [], tokenUsage: 0 };
		}
	}

	async finish(processedDocument: ProcessedDocument) {
		const { error } = await this.supabase
			.from("processed_documents")
			.update({ processing_finished_at: new Date() })
			.eq("id", processedDocument.id);

		if (error) {
			throw new Error(
				`Error updating finished processed document: ${error.message}`,
			);
		}
	}

	async finishWithError(
		processedDocument: ProcessedDocument,
		errorMessage: string,
	) {
		const { error } = await this.supabase
			.from("processed_documents")
			.update({
				processing_finished_at: new Date(),
				processing_error: errorMessage,
			})
			.eq("id", processedDocument.id);

		if (error) {
			throw new Error(
				`Error updating finished processed document: ${error.message}`,
			);
		}
	}
}
