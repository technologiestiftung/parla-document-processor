import fs from "fs";
import { OpenAIApi } from "openai";
import { generateEmbedding } from "../utils/OpenAiUtils.js";
import {
	enc,
	splitArrayEqually,
	splitInChunksAccordingToTokenLimit,
} from "../utils/utils.js";
import {
	ExtractionResult,
	EmbeddingResult,
	Chunk,
	Embedding,
	RegisteredDocument,
	ProcessedDocumentChunk,
	ProcessedDocumentSummary,
	SummaryEmbeddingResult,
	ProcessedDocument,
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

			const markdownData = fs.readFileSync(mdFile.path, { encoding: "utf8" });

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

	static async regenerateEmbeddingsForChunks(
		registeredDocument: RegisteredDocument,
		processedDocument: ProcessedDocument,
		processedDocumentChunks: Array<ProcessedDocumentChunk>,
		openAi: OpenAIApi,
	): Promise<EmbeddingResult> {
		const batchSize = 5;
		const batches = splitArrayEqually(processedDocumentChunks, batchSize);
		console.log(
			`generating embeddings for ${processedDocumentChunks.length} chunks in ${batches.length} of size ${batchSize}...`,
		);
		let allEmbeddings: Array<any> = [];
		for (let index = 0; index < batches.length; index++) {
			const chunkBatch = batches[index];
			const chunkEmbeddings = await Promise.all(
				chunkBatch.map(async (chunk) => {
					const embeddingRespone = await generateEmbedding(
						chunk.content,
						openAi,
					);
					return {
						...chunk,
						embedding: [], // not used
						embeddingTemp: embeddingRespone, // newly generated embedding
					};
				}),
			);
			allEmbeddings = allEmbeddings.concat(chunkEmbeddings);
			console.log(`generated ${allEmbeddings.length} embeddings...`);
		}

		const embeddings = allEmbeddings.map((emb) => {
			return {
				id: emb.id,
				content: emb.content,
				embedding: [], // not used
				embeddingTemp: emb.embeddingTemp.embedding, // newly generated embedding
				chunkIndex: emb.chunk_index,
				page: emb.page,
			} as Embedding;
		});

		const totalTokenUsage = allEmbeddings
			.map((chunk) => chunk.embeddingTemp.tokenUsage)
			.reduce((total, num) => total + num, 0);

		return {
			document: registeredDocument,
			processedDocument: processedDocument,
			embeddings: embeddings,
			tokenUsage: totalTokenUsage,
		} as EmbeddingResult;
	}

	static async regenerateEmbeddingsForSummary(
		processedDocumentSummaries: ProcessedDocumentSummary,
		openAi: OpenAIApi,
	): Promise<SummaryEmbeddingResult> {
		const embeddingRespone = await generateEmbedding(
			processedDocumentSummaries.summary,
			openAi,
		);

		return {
			summary: processedDocumentSummaries,
			embedding: embeddingRespone.embedding,
			tokenUsage: embeddingRespone.tokenUsage,
		} as SummaryEmbeddingResult;
	}
}
