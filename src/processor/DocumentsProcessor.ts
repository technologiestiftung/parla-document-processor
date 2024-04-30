import { OpenAI } from "openai";
import { SupabaseClient, createClient } from "@supabase/supabase-js";
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
import { DocumentFinder } from "./DocumentFinder.js";

export class DocumentsProcessor {
	settings: Settings;
	sql: postgres.Sql<{}>;
	supabase: SupabaseClient<any, "public", any>;
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

	async summarize(
		extractionResult: ExtractionResult,
	): Promise<SummarizeResult> {
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

	async embedd(extractionResult: ExtractionResult): Promise<EmbeddingResult> {
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
