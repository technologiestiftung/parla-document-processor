import { OpenAIApi } from "openai";
import { backOff } from "exponential-backoff";

export interface OpenAITextResponse {
	result: string;
	inputTokens: number;
	outputTokens: number;
}

export interface OpenAIEmbeddingResponse {
	embedding: Array<number>;
	tokenUsage: number;
}

export interface OpenAITagsResponse {
	tags: Array<string>;
	inputTokens: number;
	outputTokens: number;
}

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
				console.log(`retry #${attemptNumber} in final summary...`);
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
