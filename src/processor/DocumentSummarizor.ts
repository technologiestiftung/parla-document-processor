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
	summary: string;
	embedding: Array<number>;
	tags: Array<string>;
}

export interface ProcessingError {
	document: RegisteredDocument;
	processedDocument: ProcessedDocument;
	error: string;
}

export class DocumentSummarizor {
	static async summarize(
		extractionResult: ExtractionResult,
		openAi: OpenAIApi,
		settings: Settings,
	): Promise<SummarizeResult | ProcessingError> {
		const markdownFiles = fs
			.readdirSync(extractionResult.pagesPath)
			.filter((file) => file.endsWith(".md"))
			.sort();

		if (markdownFiles.length > settings.maxPagesForSummary) {
			return {
				document: extractionResult.document,
				processedDocument: extractionResult.processedDocument,
				error: `SummarizeError: Document has ${markdownFiles.length} pages, summary is only available for <= ${settings.maxPagesForSummary} pages.`,
			} as ProcessingError;
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
		const combinedPageSummaries = pageSummaries.join("\n");

		// Generate final summary
		const finalSummary = await generateSummary(combinedPageSummaries, openAi);

		// Generate embedding
		const embedding = await generateEmbedding(finalSummary, openAi);

		// Generate tags
		const tags = await generateTags(combinedPageSummaries, openAi);

		const summaryResponse = {
			document: extractionResult.document,
			processedDocument: extractionResult.processedDocument!,
			summary: finalSummary,
			embedding: embedding,
			tags: tags,
		};

		console.log(`Summarized ${extractionResult.pagesPath}...`);

		return summaryResponse;
	}
}
