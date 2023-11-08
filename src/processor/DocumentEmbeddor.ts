import fs from "fs";
import { OpenAIApi } from "openai";
import { generateEmbedding } from "../utils/OpenAiUtils.js";
import { enc, splitInChunksAccordingToTokenLimit } from "../utils/utils.js";
import {
	ExtractionResult,
	EmbeddingResult,
	Chunk,
	Embedding,
} from "../interfaces/Common.js";

// Magic token limit assuming we use a model with 16k context token limit
// With that limit, we can feed max. 10 chunks (+ prompt + query) to the completion
// query without exceeding the token limit
export const MAGIC_TOKEN_LIMIT = 1500;

export class DocumentEmbeddor {
	static async embedd(
		extractionResult: ExtractionResult,
		openAi: OpenAIApi,
	): Promise<EmbeddingResult> {
		let totalMarkdownData = "";
		let chunks: Array<Chunk> = [];

		for (let idx = 0; idx < extractionResult.extractedFiles.length; idx++) {
			const mdFile = extractionResult.extractedFiles[idx];

			const markdownData = fs
				.readFileSync(mdFile.path, "utf8")
				.replace(/\n/g, " ")
				.replace(/\0/g, " ");

			const chunksOnThisPage = splitInChunksAccordingToTokenLimit(
				markdownData,
				MAGIC_TOKEN_LIMIT,
			);

			chunks = chunks.concat(
				chunksOnThisPage.map((chunk, chunkIndex) => {
					return {
						content: chunk,
						page: mdFile.page,
						tokenCount: enc.encode(chunk).length,
						chunkIndex: chunkIndex,
					} as Chunk;
				}),
			);

			totalMarkdownData += markdownData;
		}

		const chunkEmbeddings = await Promise.all(
			chunks.map(async (chunk) => {
				const embedding = await generateEmbedding(chunk.content, openAi);
				return { ...chunk, embedding: embedding };
			}),
		);

		const embeddings = chunkEmbeddings.map((emb) => {
			return {
				content: emb.content,
				embedding: emb.embedding.embedding,
				chunkIndex: emb.chunkIndex,
				page: emb.page,
			} as Embedding;
		});

		const totalTokenUsage = chunkEmbeddings
			.map((chunk) => chunk.tokenCount)
			.reduce((total, num) => total + num, 0);

		return {
			document: extractionResult.document,
			processedDocument: extractionResult.processedDocument,
			embeddings: embeddings,
			tokenUsage: totalTokenUsage,
		} as EmbeddingResult;
	}
}
