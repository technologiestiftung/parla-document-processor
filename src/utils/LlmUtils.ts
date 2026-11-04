import { OpenAI } from "openai";
import { backOff } from "exponential-backoff";
import {
	LlmEmbeddingResponse,
	LlmTagsResponse,
	LlmTextResponse,
} from "../interfaces/Common.js";
import {
	enc,
	splitArrayEqually,
	splitInChunksAccordingToTokenLimit,
} from "./utils.js";
import { MAX_TOKEN_COUNT_FOR_SUMMARY } from "../processor/DocumentSummarizor.js";
import { settings } from "../Settings.js";

export async function generateEmbedding(
	content: string,
	llm: OpenAI,
): Promise<LlmEmbeddingResponse> {
	const embeddingResponse = await backOff(
		async () =>
			await llm.embeddings.create(
				{
					model: settings.llmEmbeddingModel,
					input: content,
				},
				{ timeout: 10000 },
			),
		{
			startingDelay: 1000,
			numOfAttempts: 10,
			retry: (e: any, attemptNumber: number) => {
				console.log(
					`retry #${attemptNumber} in generating embedding, cause: ${e}`,
				);
				return true;
			},
		},
	);
	const [responseData] = embeddingResponse.data;
	return {
		embedding: responseData.embedding,
		tokenUsage: embeddingResponse.usage.total_tokens,
	};
}

// Reasoning models (e.g. GLM via Mistral) return the content as a list of chunks
// (thinking and text) instead of a string, so only the text chunks are kept
function getTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		return (content as Array<{ type: string; text?: string }>)
			.filter(({ type }) => type === "text")
			.map(({ text }) => text ?? "")
			.join("");
	}
	return "";
}

// Only sent if set, as not every model supports it (e.g. models without reasoning reject it)
function getReasoningEffortParam(): Record<string, string> {
	return settings.llmChatReasoningEffort
		? { reasoning_effort: settings.llmChatReasoningEffort }
		: {};
}

// Not every model / provider enforces response_format, so the JSON object may be wrapped in text or code fences
function parseJsonObject(content: string) {
	const start = content.indexOf("{");
	const end = content.lastIndexOf("}");
	if (start === -1 || end === -1) {
		throw new Error(`No JSON object found in response: ${content}`);
	}
	return JSON.parse(content.slice(start, end + 1));
}

export async function generateTags(
	content: string,
	llm: OpenAI,
): Promise<LlmTagsResponse> {
	const { tagSummary, tags } = await backOff(
		async () => {
			const tagSummary = await llm.chat.completions.create(
				{
					model: settings.llmChatModel,
					...getReasoningEffortParam(),
					response_format: { type: "json_object" },
					messages: [
						{
							role: "system",
							content: `
							Du bist ein politischer Dokumenten-Assistent, der Inhalte versteht, zusammenfasst und Tags generiert.
							Erhalte ein durch """ abgegrenztes Dokument.
							Generiere 10 Tags, die das Dokument treffend beschreiben.
							Konzentriere dich auf die Hauptinhalte.
							Verändere oder erfinde NIEMALS Fakten, Namen, Berufsbezeichnungen, Zahlen oder Datumsangaben.
							Antwortformat: Ein syntaktisch gültiges JSON Objekt im Format {tags: ['tag_1', 'tag_2', 'tag_x']}.`,
						},
						{
							role: "user",
							content: `Extrahiere eine Liste von inhaltlich relevanten Tags aus dem folgenden Dokument. Gebe ein JSON Objekt im Format {tags: ['tag_1', 'tag_2', 'tag_x']} zurück. Das ist das Dokument: """${content}""" `,
						},
					],
					temperature: 0,
					stream: false,
				},
				{ timeout: 100000 },
			);
			// Parse inside backOff so that malformed JSON triggers a retry
			const tags = parseJsonObject(
				getTextContent(tagSummary.choices[0].message?.content),
			);
			return { tagSummary, tags };
		},
		{
			startingDelay: 1000,
			numOfAttempts: 10,
			retry: (e: any, attemptNumber: number) => {
				console.log(`retry #${attemptNumber} in generating tags, cause: ${e}`);
				return true;
			},
		},
	);

	return {
		tags: tags,
		inputTokens: tagSummary.usage?.prompt_tokens ?? 0,
		outputTokens: tagSummary.usage?.completion_tokens ?? 0,
	};
}

export async function generateSummary(
	content: string,
	llm: OpenAI,
): Promise<LlmTextResponse> {
	const completeSummary = await backOff(
		async () =>
			await llm.chat.completions.create(
				{
					model: settings.llmChatModel,
					...getReasoningEffortParam(),
					messages: [
						{
							role: "system",
							content: `
							Du bist ein politischer Dokumenten-Assistent, der Inhalte versteht und zusammenfasst.
							Die Zusammenfassung sollte alle wichtigen Punkte und Hauptgedanken des Originaltexts abdecken und die Informationen gleichzeitig in ein prägnantes und leicht verständliches Format bringen.
							Bitte stelle sicher, dass die Zusammenfassung relevante Details und Beispiele enthält, die die Hauptgedanken unterstützen, und vermeide gleichzeitig unnötige Informationen oder Wiederholungen.
							Die Länge der Zusammenfassung sollte der Länge und Komplexität des Originaltexts angemessen sein und einen klaren und genauen Überblick bieten, ohne wichtige Informationen auszulassen.
							Verändere oder erfinde NIEMALS Fakten, Namen, Berufsbezeichnungen, Zahlen oder Datumsangaben.`,
						},
						{
							role: "user",
							content: `Fasse das folgende Dokument zusammen: """${content}"""`,
						},
					],
					temperature: 0,
					stream: false,
				},
				{ timeout: 100000 },
			),
		{
			startingDelay: 1000,
			numOfAttempts: 10,
			retry: (e: any, attemptNumber: number) => {
				console.log(`retry #${attemptNumber} in final summary, cause: ${e}`);
				return true;
			},
		},
	);

	const summary = getTextContent(completeSummary.choices[0].message?.content);
	if (summary.length === 0) {
		throw new Error("Generated summary is empty");
	}

	return {
		result: summary,
		inputTokens: completeSummary.usage?.prompt_tokens ?? 0,
		outputTokens: completeSummary.usage?.completion_tokens ?? 0,
	};
}

export async function generateSummaryForLargeDocument(
	completeDocument: string,
	llm: OpenAI,
	allSummaries: Array<LlmTextResponse> = [],
): Promise<LlmTextResponse> {
	// Split in chunks where each token count of chunk < MAX_TOKEN_COUNT_FOR_SUMMARY
	const maxTokenChunks = splitInChunksAccordingToTokenLimit(
		completeDocument,
		MAX_TOKEN_COUNT_FOR_SUMMARY,
	);

	// Generate summaries in batches (to avoid 429)
	let batches = splitArrayEqually(maxTokenChunks, 10);
	var summaries: Array<LlmTextResponse> = [];
	for (let idx = 0; idx < batches.length; idx++) {
		const batch = batches[idx];
		const sx = await Promise.all(
			batch.map(async (chunk) => {
				const summary = await generateSummary(chunk, llm);
				return summary;
			}),
		);
		summaries = summaries.concat(sx);
	}

	// Concatenate the summaries
	const totalSummary = summaries.map((s) => s.result).join("\n");
	const totalSummaryTokens = enc.encode(totalSummary).length;

	console.log(
		`Generated ${
			summaries.length
		} individual summaries with input tokens=[${summaries.map(
			(s) => s.inputTokens,
		)}], output tokens=[${summaries.map((s) => s.outputTokens)}]...`,
	);

	const combinedSummaries = allSummaries.concat(summaries);

	if (totalSummaryTokens > MAX_TOKEN_COUNT_FOR_SUMMARY) {
		// Recursively start again with new summary as document
		return generateSummaryForLargeDocument(
			totalSummary,
			llm,
			combinedSummaries,
		);
	} else {
		// Generate final summary
		const finalSummary = await generateSummary(totalSummary, llm);
		console.log(
			`Generated final summary with input tokens=${finalSummary.inputTokens} and output tokens=${finalSummary.outputTokens}...`,
		);
		return {
			result: finalSummary.result,
			inputTokens:
				combinedSummaries.map((s) => s.inputTokens).reduce((l, r) => l + r, 0) +
				finalSummary.inputTokens,
			outputTokens:
				combinedSummaries
					.map((s) => s.outputTokens)
					.reduce((l, r) => l + r, 0) + finalSummary.outputTokens,
		};
	}
}
