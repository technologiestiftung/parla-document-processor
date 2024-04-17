import fs from "fs";
import { OpenAIApi } from "openai";
import {
	ExtractionResult,
	OpenAITextResponse,
	ProcessedDocument,
	RegisteredDocument,
	SummarizeResult,
} from "../interfaces/Common.js";
import {
	generateEmbedding,
	generateSummary,
	generateSummaryForLargeDocument,
	generateTags,
} from "../utils/OpenAiUtils.js";
import { enc } from "../utils/utils.js";

// We use a model with 16k context size, we reserve 1k for the prompt so that we can send ~15k tokens as payload
export const MAX_TOKEN_COUNT_FOR_SUMMARY = 15000;

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
	): Promise<SummarizeResult> {
		const markdownFiles = fs
			.readdirSync(extractionResult.pagesPath)
			.filter((file) => file.endsWith(".md"))
			.sort();

		// Generate page summaries
		const markdownTexts = await Promise.all(
			markdownFiles.map(async (mf) => {
				const markdownText = fs.readFileSync(
					`${extractionResult.pagesPath}/${mf}`,
					"utf-8",
				);
				return markdownText;
			}),
		);
		const completeMarkdown = markdownTexts.join("\n");

		// Generate summary
		const numTokens = enc.encode(completeMarkdown).length;
		let summary: OpenAITextResponse | undefined = undefined;
		if (numTokens > MAX_TOKEN_COUNT_FOR_SUMMARY) {
			console.log(
				`Number of tokens (${numTokens}) of document ${extractionResult.document.source_url} exceeds max. context size (${MAX_TOKEN_COUNT_FOR_SUMMARY}). Recursively generating summary...`,
			);
			summary = await generateSummaryForLargeDocument(completeMarkdown, openAi);
		} else {
			console.log(
				`Number of tokens (${numTokens}) of document ${extractionResult.document.source_url} is less than max. context size (${MAX_TOKEN_COUNT_FOR_SUMMARY}). Generating summary in one run...`,
			);
			summary = await generateSummary(completeMarkdown, openAi);
		}

		// Generate embedding
		const embeddingResponse = await generateEmbedding(summary!.result, openAi);

		// Generate tags
		const tagsResponse = await generateTags(summary!.result, openAi);

		const summaryResponse = {
			document: extractionResult.document,
			processedDocument: extractionResult.processedDocument!,
			summary: summary!.result,
			embedding: embeddingResponse.embedding,
			tags: tagsResponse.tags.tags,
			pagesPath: extractionResult.pagesPath,
			embeddingTokens: embeddingResponse.tokenUsage,
			inputTokens: summary!.inputTokens,
			outputTokens: summary!.outputTokens,
		};

		return summaryResponse;
	}
}
