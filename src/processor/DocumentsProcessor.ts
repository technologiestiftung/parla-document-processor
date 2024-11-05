import { SupabaseClient, createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";
import postgres from "postgres";
import {
	ExtractRequest,
	ExtractionResult,
	ProcessedDocument,
	RegisteredDocument,
	Settings,
} from "../interfaces/Common.js";
import { DocumentEmbeddor } from "./DocumentEmbeddor.js";
import { DocumentExtractor } from "./DocumentExtractor.js";
import { DocumentFinder } from "./DocumentFinder.js";
import { DocumentSummarizor } from "./DocumentSummarizor.js";
import { splitArrayEqually } from "../utils/utils.js";

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

	// Reextract = re-extracts the document, but does not create a new processed document
	async reextract(document: RegisteredDocument) {
		const extractionResult = await DocumentExtractor.extract(
			{
				document: document,
				targetPath: this.settings.processingDirectory,
			} as ExtractRequest,
			this.settings,
		);

		const { data, error } = await this.supabase
			.from("processed_documents")
			.select("*")
			.eq("registered_document_id", document.id);

		if (error) {
			throw new Error(`Error getting processed document: ${error.message}`);
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

	// Resummarize = re-creates and re-embedds the summary
	async resummarize(extractionResult: ExtractionResult) {
		const summary = await DocumentSummarizor.summarize(
			extractionResult,
			this.openAi,
		);
		const { error } = await this.supabase
			.from("processed_document_summaries")
			.update({
				summary_temp: summary.summary,
				summary_embedding_temp: summary.embedding,
				tags_temp: summary.tags,
			})
			.eq("processed_document_id", summary.processedDocument.id);

		if (error) {
			throw new Error(
				`Error updating processed document summary: ${error.message}`,
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

	// Reembed = re-creates and re-embedds the chunks
	async reembedd(extractionResult: ExtractionResult) {
		const embeddingResult = await DocumentEmbeddor.embedd(
			extractionResult,
			this.openAi,
		);

		const embeddingBatches = splitArrayEqually(embeddingResult.embeddings, 10);
		for (const batch of embeddingBatches) {
			await Promise.all(
				batch.map(async (batchItem) => {
					const { error } = await this.supabase
						.from("processed_document_chunks")
						.update({
							content_temp: batchItem.content,
							embedding_temp: batchItem.embedding,
						})
						.eq("processed_document_id", embeddingResult.processedDocument.id)
						.eq("chunk_index", batchItem.chunkIndex)
						.eq("page", batchItem.page)
						.select("*");
					if (error) {
						throw new Error(
							`Error updating processed document embeddings: ${error.message}`,
						);
					}
				}),
			);
		}
		return embeddingResult;
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
