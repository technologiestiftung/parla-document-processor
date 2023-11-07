import fs from "fs";
import { OpenAIApi } from "openai";
import { ExtractionResult } from "./DocumentExtractor.js";
import { ProcessedDocument, RegisteredDocument } from "./DocumentsProcessor.js";
import { Settings } from "../interfaces/Settings.js";
import { backOff } from "exponential-backoff";

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

		const pageSummaries = await Promise.all(
			markdownFiles.map(async (mf) => {
				const markdownText = fs.readFileSync(
					`${extractionResult.pagesPath}/${mf}`,
					"utf-8",
				);

				const summaryResponse = await backOff(
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
									content: `Fasse das folgende Dokument in weniger als 100 Worten kurz und prägnant zusammen. Die Antwort muss weniger als 100 Worte lang sein. "${markdownText}"`,
								},
							],
							temperature: 0,
							stream: false,
						}),
					{
						retry: (e: any, attemptNumber: number) => {
							console.log(
								`retry #${attemptNumber} in summarizing page ${mf} ...`,
							);
							return true;
						},
					},
				);

				if (summaryResponse.status !== 200) {
					throw new Error("openapi embedding failed");
				}

				return summaryResponse.data.choices[0].message?.content ?? "";
			}),
		);

		const summaryText = pageSummaries.join("\n");

		// Generate final summary
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
							content: `Fasse das folgende Dokument in weniger als 100 Worten kurz und prägnant zusammen. Die Antwort muss weniger als 100 Worte lang sein. "${summaryText}"`,
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

		// Generate embedding
		const embeddingResponse = await backOff(
			async () =>
				await openAi.createEmbedding({
					model: "text-embedding-ada-002",
					input: completeSummary.data.choices[0].message?.content ?? "",
				}),
			{
				retry: (e: any, attemptNumber: number) => {
					console.log(`retry #${attemptNumber} in generating embedding...`);
					return true;
				},
			},
		);

		if (embeddingResponse.status !== 200) {
			throw new Error("openapi embedding failed");
		}
		const [responseData] = embeddingResponse.data.data;

		// Generate tags
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
							content: `Extrahiere eine Liste von inhaltlich relevanten Tags aus dem folgenden Text. Generiere nicht mehr als 10 Tags. Gebe die Tags formatiert als JSON Liste zurück: "${summaryText}"`,
						},
					],
					temperature: 0,
					stream: false,
				}),
			{
				retry: (e: any, attemptNumber: number) => {
					console.log(`retry #${attemptNumber} in extracting tags...`);
					return true;
				},
			},
		);

		const tags = JSON.parse(tagSummary.data.choices[0].message?.content ?? "");

		const summaryResponse = {
			document: extractionResult.document,
			processedDocument: extractionResult.processedDocument!,
			summary: completeSummary.data.choices[0].message?.content ?? "",
			embedding: responseData.embedding,
			tags: tags,
		};

		console.log(`Summarized ${extractionResult.pagesPath}...`);

		return summaryResponse;
	}
}
