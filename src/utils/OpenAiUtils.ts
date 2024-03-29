import { OpenAIApi } from "openai";
import { backOff } from "exponential-backoff";
import {
	OpenAIEmbeddingResponse,
	OpenAITagsResponse,
	OpenAITextResponse,
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
	openAi: OpenAIApi,
): Promise<OpenAIEmbeddingResponse> {
	const embeddingResponse = await backOff(
		async () =>
			await openAi.createEmbedding(
				{
					model: settings.openAiEmbeddingModel,
					input: content,
				},
				{ timeout: 5000 },
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
	const [responseData] = embeddingResponse.data.data;
	return {
		embedding: responseData.embedding,
		tokenUsage: embeddingResponse.data.usage.total_tokens,
	};
}

export async function generateTags(
	content: string,
	openAi: OpenAIApi,
): Promise<OpenAITagsResponse> {
	const tagSummary = await backOff(
		async () =>
			await openAi.createChatCompletion(
				{
					model: settings.openAiModel,
					messages: [
						{
							role: "system",
							content: `
							Du bist ein politischer Dokumenten-Assistent, der Inhalte versteht, zusammenfasst und Tags generiert.
							Erhalte ein durch """ abgegrenztes Dokument.
							Generiere 10 Tags, die das Dokument treffend beschreiben.
							Konzentriere dich auf die Hauptinhalte.
							Verändere oder erfinde NIEMALS Fakten, Namen, Berufsbezeichnungen, Zahlen oder Datumsangaben.
							Antwortformat: Ein syntaktisch gültiges JSON Array. Gebe IMMER nur das JSON Array zurück, ohne weitere Formatierung.`,
						},
						{
							role: "user",
							content: `Extrahiere eine Liste von inhaltlich relevanten Tags aus dem folgenden Dokument: """${content}"""`,
						},
					],
					temperature: 0,
					stream: false,
				},
				{ timeout: 10000 },
			),
		{
			startingDelay: 1000,
			numOfAttempts: 10,
			retry: (e: any, attemptNumber: number) => {
				console.log(`retry #${attemptNumber} in generating tags, cause: ${e}`);
				return true;
			},
		},
	);

	const tags = JSON.parse(tagSummary.data.choices[0].message?.content ?? "");

	return {
		tags: tags,
		inputTokens: tagSummary.data.usage?.prompt_tokens ?? 0,
		outputTokens: tagSummary.data.usage?.completion_tokens ?? 0,
	};
}

export async function generateSummary(
	content: string,
	openAi: OpenAIApi,
): Promise<OpenAITextResponse> {
	const completeSummary = await backOff(
		async () =>
			await openAi.createChatCompletion(
				{
					model: settings.openAiModel,
					messages: [
						{
							role: "system",
							content: `
							Du bist ein politischer Dokumenten-Assistent, der Inhalte versteht und zusammenfasst.
							Erhalte ein durch """ abgegrenztes Dokument.
							Die Zusammenfassung soll inhaltlich prägnant sein.
							Verändere oder erfinde NIEMALS Fakten, Namen, Berufsbezeichnungen, Zahlen oder Datumsangaben.
							Begrenze die Zusammenfassung auf maximal 100 Wörter`,
						},
						{
							role: "user",
							content: `Fasse das folgende Dokument in 100 Worten zusammen: """${content}"""`,
						},
					],
					temperature: 0,
					stream: false,
				},
				{ timeout: 10000 },
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

	return {
		result: completeSummary.data.choices[0].message?.content ?? "",
		inputTokens: completeSummary.data.usage?.prompt_tokens ?? 0,
		outputTokens: completeSummary.data.usage?.completion_tokens ?? 0,
	};
}

export async function generateSummaryForLargeDocument(
	completeDocument: string,
	openAi: OpenAIApi,
	allSummaries: Array<OpenAITextResponse> = [],
): Promise<OpenAITextResponse> {
	// Split in chunks where each token count of chunk < MAX_TOKEN_COUNT_FOR_SUMMARY
	const maxTokenChunks = splitInChunksAccordingToTokenLimit(
		completeDocument,
		MAX_TOKEN_COUNT_FOR_SUMMARY,
	);

	// Generate summaries in batches (to avoid 429)
	let batches = splitArrayEqually(maxTokenChunks, 20);
	var summaries: Array<OpenAITextResponse> = [];
	for (let idx = 0; idx < batches.length; idx++) {
		const batch = batches[idx];
		const sx = await Promise.all(
			batch.map(async (chunk) => {
				const summary = await generateSummary(chunk, openAi);
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
			openAi,
			combinedSummaries,
		);
	} else {
		// Generate final summary
		const finalSummary = await generateSummary(totalSummary, openAi);
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
