import { SupabaseClient, createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { Database } from "../db/db_schema.js";
import { Settings } from "../interfaces/Settings.js";
import {
	DocumentExtractor,
	ExtractContract,
	ExtractionResult,
} from "./DocumentExtractor.js";
import {
	DocumentSummarizor,
	ProcessingError,
	SummarizeResult,
} from "./DocumentSummarizor.js";
import { Configuration, OpenAIApi } from "openai";

export type RegisteredDocument =
	Database["public"]["Tables"]["registered_documents"]["Row"];

export type ProcessedDocument =
	Database["public"]["Tables"]["processed_documents"]["Row"];

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
			const processedButNotFinished = d.processed_documents.filter(
				(pd: ProcessedDocument) =>
					pd.processing_error ||
					!pd.processing_started_at ||
					!pd.processing_finished_at,
			);
			return unprocessed || processedButNotFinished;
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

	async extract(
		documents: Array<RegisteredDocument>,
	): Promise<Array<ExtractionResult>> {
		const testLoad = documents.slice(0, 100);
		console.log(`Extracting ${testLoad.length} documents...`);

		const extractionResults = await Promise.all(
			testLoad.map(
				async (d) =>
					await DocumentExtractor.extract({
						document: d,
						targetPath: "./processing_data",
					} as ExtractContract),
			),
		);

		const insertedProcessedDocuments = await Promise.all(
			extractionResults.map(async (r) => {
				const { data } = await this.supabase
					.from("processed_documents")
					.insert({
						file_checksum: r.checksum,
						file_size: r.fileSize,
						num_pages: r.numPages,
						processing_started_at: new Date(),
						registered_document_id: r.document.id,
					})
					.select("*");

				return { ...r, processedDocument: data![0] };
			}),
		);

		return insertedProcessedDocuments;
	}

	async summarize(extractionResults: Array<ExtractionResult>) {
		console.log(`Summarizing ${extractionResults.length} documents...`);
		const summaries = await Promise.all(
			extractionResults.map(async (r) => {
				const summary = await DocumentSummarizor.summarize(
					r,
					this.openAi,
					this.settings,
				);
				return summary;
			}),
		);
		await Promise.all(
			summaries
				.filter((s) => s !== undefined)
				.map(async (s) => {
					const summaryError = s as ProcessingError;
					const summaryResult = s as SummarizeResult;
					console.log(summaryError, summaryResult);
					if (summaryError.error) {
						console.log("Updating with error");
						const { data, error } = await this.supabase
							.from("processed_documents")
							.update({
								processing_finished_at: new Date(),
								processing_error: (s as ProcessingError).error,
							})
							.eq("id", summaryError.processedDocument.id);
						console.log(data, error);
					} else {
						console.log("Updating with summary");
						const { data, error } = await this.supabase
							.from("processed_document_summaries")
							.insert({
								summary: summaryResult.summary,
								summary_embedding: summaryResult.embedding,
								tags: summaryResult.tags,
								processed_document_id: summaryResult.processedDocument.id,
							});
					}
				}),
		);
	}
	static async embedd() {
		throw new Error("Method not implemented.");
	}
}
