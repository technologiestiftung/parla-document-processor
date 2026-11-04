import fs from "fs";
import { OpenAI } from "openai";
import {
	ExtractionResult,
	LlmTextResponse,
	ProcessedDocument,
	RegisteredDocument,
	SummarizeResult,
} from "../interfaces/Common.js";
import {
	generateEmbedding,
	generateSummary,
	generateSummaryForLargeDocument,
	generateTags,
} from "../utils/LlmUtils.js";
import { enc } from "../utils/utils.js";
import { settings } from "../Settings.js";

// Otherwise the comparisons with MAX_TOKEN_COUNT_FOR_SUMMARY (NaN) are always false and
// large documents are sent in one run instead of being split
if (isNaN(settings.llmChatContextWindow)) {
	throw new Error("LLM_CHAT_CONTEXT_WINDOW is not set or not a number");
}

// Context window of the chat model (LLM_CHAT_CONTEXT_WINDOW), we reserve 1k for the prompt
// so that the rest can be sent as payload
export const MAX_TOKEN_COUNT_FOR_SUMMARY = settings.llmChatContextWindow - 1000;

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
		llm: OpenAI,
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
					{ encoding: "utf8" },
				);
				return markdownText;
			}),
		);
		const completeMarkdown = markdownTexts.join("\n");

		// Generate summary
		const numTokens = enc.encode(completeMarkdown).length;
		let summary: LlmTextResponse | undefined = undefined;
		if (numTokens > MAX_TOKEN_COUNT_FOR_SUMMARY) {
			console.log(
				`Number of tokens (${numTokens}) of document ${extractionResult.document.source_url} exceeds max. context size (${MAX_TOKEN_COUNT_FOR_SUMMARY}). Recursively generating summary...`,
			);
			summary = await generateSummaryForLargeDocument(completeMarkdown, llm);
		} else {
			console.log(
				`Number of tokens (${numTokens}) of document ${extractionResult.document.source_url} is less than max. context size (${MAX_TOKEN_COUNT_FOR_SUMMARY}). Generating summary in one run...`,
			);
			summary = await generateSummary(completeMarkdown, llm);
		}

		// Generate embedding
		const embeddingResponse = await generateEmbedding(summary!.result, llm);

		// Generate tags
		const tagsResponse = await generateTags(summary!.result, llm);

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
