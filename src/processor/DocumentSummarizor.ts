import fs from "fs";
import { OpenAIApi } from "openai";
import { ExtractionResult } from "./DocumentExtractor.js";
import { ProcessedDocument, RegisteredDocument } from "./DocumentsProcessor.js";
import { Settings } from "../interfaces/Settings.js";
import {
	generateEmbedding,
	generateSummary,
	generateTags,
} from "../utils/OpenAiUtils.js";

export interface SummarizeResult {
	document: RegisteredDocument;
	processedDocument: ProcessedDocument;
	pagesPath: string;
	summary: string;
	embedding: Array<number>;
	tags: Array<string>;
	tokenUsage: number;
}

export interface ProcessingError {}

export class ProcessingError extends Error {
	document: RegisteredDocument;
	processedDocument: ProcessedDocument;
	error: string;
	constructor(
		document: RegisteredDocument,
		processedDocument: ProcessedDocument,
		error: string,
	) {
		super();
		this.document = document;
		this.processedDocument = processedDocument;
		this.error = error;
	}
}

export class DocumentSummarizor {
	static async summarize(
		extractionResult: ExtractionResult,
		openAi: OpenAIApi,
		settings: Settings,
	): Promise<SummarizeResult> {
		const markdownFiles = fs
			.readdirSync(extractionResult.pagesPath)
			.filter((file) => file.endsWith(".md"))
			.sort();

		if (markdownFiles.length > settings.maxPagesForSummary) {
			throw new ProcessingError(
				extractionResult.document,
				extractionResult.processedDocument!,
				`SummarizeError: Document has ${markdownFiles.length} pages, summary is only available for <= ${settings.maxPagesForSummary} pages.`,
			);
		}

		// Generate page summaries
		const pageSummaries = await Promise.all(
			markdownFiles.map(async (mf) => {
				const markdownText = fs.readFileSync(
					`${extractionResult.pagesPath}/${mf}`,
					"utf-8",
				);
				const summaryResponse = await generateSummary(markdownText, openAi);
				return summaryResponse;
			}),
		);
		const combinedPageSummariesTokenUsage = pageSummaries
			.map((x) => x.tokenUsage)
			.reduce((total, num) => total + num, 0);
		const combinedPageSummaries = pageSummaries.map((x) => x.result).join("\n");

		// Generate final summary
		const finalSummaryResponse = await generateSummary(
			combinedPageSummaries,
			openAi,
		);

		// Generate embedding
		const embeddingResponse = await generateEmbedding(
			finalSummaryResponse.result,
			openAi,
		);

		// Generate tags
		const tagsResponse = await generateTags(combinedPageSummaries, openAi);

		const totalTokenUsage =
			combinedPageSummariesTokenUsage +
			finalSummaryResponse.tokenUsage +
			embeddingResponse.tokenUsage +
			tagsResponse.tokenUsage;

		const summaryResponse = {
			document: extractionResult.document,
			processedDocument: extractionResult.processedDocument!,
			summary: finalSummaryResponse.result,
			embedding: embeddingResponse.embedding,
			tags: tagsResponse.tags,
			pagesPath: extractionResult.pagesPath,
			tokenUsage: totalTokenUsage,
		};

		return summaryResponse;
	}
}
