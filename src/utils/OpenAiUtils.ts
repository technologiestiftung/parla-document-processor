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

export async function generateEmbedding(
	content: string,
	openAi: OpenAIApi,
): Promise<OpenAIEmbeddingResponse> {
	const embeddingResponse = await backOff(
		async () =>
			await openAi.createEmbedding({
				model: "text-embedding-ada-002",
				input: content,
			}),
		{
			retry: (e: any, attemptNumber: number) => {
				console.log(`retry #${attemptNumber} in generating embedding...`);
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
			await openAi.createChatCompletion({
				model: "gpt-3.5-turbo-16k",
				messages: [
					{
						role: "system",
						content:
							"Du bist ein System, das in der Lage ist Text in inhaltlich relevante Schlagwörter / Tags zusammenzufassen. Generiere niemals mehr als 10 Tags.",
					},
					{
						role: "user",
						content: `Extrahiere eine Liste von inhaltlich relevanten Tags aus dem folgenden Text. Generiere nicht mehr als 10 Tags. Gebe die Tags formatiert als JSON Liste zurück: "${content}"`,
					},
				],
				temperature: 0,
				stream: false,
			}),
		{
			retry: (e: any, attemptNumber: number) => {
				console.log(`retry #${attemptNumber} in generating tags...`);
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

export async function generateSummaryMock(
	content: string,
	openAi: OpenAIApi,
): Promise<OpenAITextResponse> {
	const mockedResponse =
		"Der Senat von Berlin beantwortet die schriftliche Anfrage des Abgeordneten Tommy Tabor (AfD) zum Thema des Marathons am Wahlsonntag. Der Senat hat keine Informationen über den Eintrag des Veranstalters des Berlin-Marathons in das EMAS-Register und kann keine Aussage über die übliche Dauer einer EMAS-Registrierung machen. Die Zusammenarbeit mit dem Veranstalter wird als vorbildlich angesehen, aber eine Vorreiterrolle bei der EMAS-Registrierung kann nicht beurteilt werden. Es liegen keine Informationen über das Recyclingunternehmen vor, mit dem der Veranstalter zusammenarbeitet. Der Veranstalter ist bereit, die Fragen zur Müllvermeidung und zum ökologischen Fußabdruck im direkten Gespräch zu beantworten.";
	return {
		result: mockedResponse,
		inputTokens: enc.encode(content).length,
		outputTokens: enc.encode(mockedResponse).length,
	};
}

export async function generateSummary(
	content: string,
	openAi: OpenAIApi,
): Promise<OpenAITextResponse> {
	const completeSummary = await backOff(
		async () =>
			await openAi.createChatCompletion({
				model: "gpt-3.5-turbo-16k",
				messages: [
					{
						role: "system",
						content:
							"Du bist ein politischer Berater und antwortest auf Deutsch in grammatikalisch korrekter und formeller Sprache.",
					},
					{
						role: "user",
						content: `Fasse das folgende Dokument in weniger als 100 Worten kurz und prägnant zusammen. Die Antwort muss weniger als 100 Worte lang sein. "${content}"`,
					},
				],
				temperature: 0,
				stream: false,
			}),
		{
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
	const maxTokenChunks = splitInChunksAccordingToTokenLimit(
		completeDocument,
		MAX_TOKEN_COUNT_FOR_SUMMARY,
	);
	let batches = splitArrayEqually(maxTokenChunks, 20);
	var summaries: Array<OpenAITextResponse> = [];
	for (let idx = 0; idx < batches.length; idx++) {
		const batch = batches[idx];
		const sx = await Promise.all(
			batch.map(async (chunk) => {
				const summary = await generateSummaryMock(chunk, openAi);
				return summary;
			}),
		);
		summaries = summaries.concat(sx);
	}

	const totalSummary = summaries.map((s) => s.result).join("\n");
	const totalSummaryTokens = enc.encode(totalSummary).length;

	console.log(
		`Generated ${summaries.length} individual summaries with totalTokenCount=${totalSummaryTokens}...`,
	);

	if (totalSummaryTokens > MAX_TOKEN_COUNT_FOR_SUMMARY) {
		// Recursively start again with new summary as document
		return generateSummaryForLargeDocument(
			totalSummary,
			openAi,
			allSummaries.concat(summaries),
		);
	} else {
		const finalSummary = await generateSummaryMock(totalSummary, openAi);
		console.log(
			`Generated 1 final summary with totalTokenCount=${finalSummary.outputTokens}...`,
		);
		return {
			result: finalSummary.result,
			inputTokens:
				allSummaries.map((s) => s.inputTokens).reduce((l, r) => l + r, 0) +
				finalSummary.inputTokens,
			outputTokens:
				allSummaries.map((s) => s.outputTokens).reduce((l, r) => l + r, 0) +
				finalSummary.outputTokens,
		};
	}
}
