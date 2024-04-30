import { get_encoding } from "@dqbd/tiktoken";
import { SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import {
	EmbeddingResult,
	ProcessedDocument,
	RegisteredDocument,
	SummarizeResult,
	TokenUsage,
} from "../interfaces/Common.js";
import { ExtractError } from "../processor/DocumentExtractor.js";
import { DocumentsProcessor } from "../processor/DocumentsProcessor.js";

export const enc = get_encoding("cl100k_base");

/**
 * This function checks if the provided value is an array.
 * If it is, it joins the array elements into a string separated by commas.
 * If it's not an array but a string, it simply returns the string.
 * If the value is undefined or null, it returns null.
 *
 */
export function checkIfArray(value: string | string[] | undefined | null) {
	if (Array.isArray(value)) {
		return value.join(",");
	}
	return value ?? null;
}

export async function splitPdf(
	pathToPdf: string,
	pdfFilename: string,
	pagesDirectory: string,
) {
	const pdfData = await fs.promises.readFile(pathToPdf);
	const pdfDoc = await PDFDocument.load(pdfData);
	const numberOfPages = pdfDoc.getPages().length;
	for (let i = 0; i < numberOfPages; i++) {
		const subDocument = await PDFDocument.create();
		const [copiedPage] = await subDocument.copyPages(pdfDoc, [i]);
		subDocument.addPage(copiedPage);
		const pdfBytes = await subDocument.save();
		await fs.promises.writeFile(
			`${pagesDirectory}/${pdfFilename.replace(".pdf", "")}-${i}.pdf`,
			pdfBytes,
		);
	}
}

export function getHash(file: string): string {
	const fileBuffer = fs.readFileSync(file);
	const hashSum = crypto.createHash("md5");
	hashSum.update(fileBuffer);
	const hex = hashSum.digest("hex");
	return hex;
}

export function getFileSize(file: string): number {
	const stats = fs.statSync(file);
	const fileSizeInBytes = stats.size;
	return fileSizeInBytes;
}

export function splitArrayEqually<T>(array: T[], chunkSize: number): T[][] {
	const result: T[][] = [];
	for (let i = 0; i < array.length; i += chunkSize) {
		result.push(array.slice(i, i + chunkSize));
	}
	return result;
}

export function splitInParts(input: string, numParts: number): string[] {
	const parts: string[] = [];
	const partSize: number = Math.ceil(input.length / numParts);
	for (let i = 0; i < input.length; i += partSize) {
		parts.push(input.substring(i, i + partSize));
	}
	return parts;
}

export function splitInChunksAccordingToTokenLimit(
	input: string,
	tokenLimit: number,
	numParts: number = 1,
): string[] {
	const splittedParts = splitInParts(input, numParts);
	const tokenLimitRespected = splittedParts.every(
		(p) => enc.encode(p).length < tokenLimit,
	);
	if (tokenLimitRespected) {
		return splittedParts;
	} else {
		return splitInChunksAccordingToTokenLimit(input, tokenLimit, numParts + 1);
	}
}

export function clearDirectory(path: string) {
	const files = fs.readdirSync(path);
	files.forEach((file) => {
		const fullPath = `${path}/${file}`;
		const stats = fs.statSync(fullPath);
		if (stats.isDirectory()) {
			fs.rmdirSync(fullPath, { recursive: true });
		} else {
			fs.rmSync(fullPath);
		}
	});
}

export function sumTokens(
	summarizeResult: SummarizeResult,
	embeddingResult: EmbeddingResult,
): TokenUsage {
	return {
		embeddings: summarizeResult.embeddingTokens + embeddingResult.tokenUsage,
		inputs: summarizeResult.inputTokens,
		outputs: summarizeResult.outputTokens,
	};
}

export async function handleError(
	e: any,
	document: RegisteredDocument,
	processedDocument: ProcessedDocument | undefined,
	processor: DocumentsProcessor,
) {
	if (processedDocument) {
		await processor.finishWithError(processedDocument, `${e}`);
		console.log(`Error processing ${document.source_url}: ${e}`);
	} else if (e instanceof ExtractError) {
		console.log(
			`Error extracting document ${document.id} / ${document.source_url}: ${e.error}`,
		);
	} else {
		console.log(`Error: ${e}`);
	}
}

export async function fetchAllRegisteredDocuments(
	supabase: SupabaseClient<any, "public", any>,
): Promise<Array<any>> {
	const PAGE_SIZE = 500;

	const { count } = await supabase
		.from("registered_documents")
		.select("*", { count: "exact", head: true });

	const rowCount = count ?? 0;
	console.log(`Total rows in registered_documents: ${rowCount}`);

	const numPages = Math.ceil(rowCount / PAGE_SIZE);
	const pageArray = Array.from({ length: numPages }, (_, index) => index);
	console.log(pageArray);
	let allData: Array<any> = [];
	for (const page of pageArray) {
		const { data: pageData, error: pageError } = await supabase
			.from("registered_documents")
			.select(
				"id, source_url, source_type, registered_at, metadata, processed_documents(*)",
			)
			.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

		allData = allData.concat(pageData);

		console.log(
			`Fetched page ${
				page + 1
			} / ${numPages}, rows: ${pageData?.length}, total: ${
				allData.length
			} error: ${JSON.stringify(pageError)}`,
		);

		if (pageError) {
			throw new Error(
				`Error fetching page ${page + 1} / ${numPages}: ${JSON.stringify(
					pageError,
				)}`,
			);
		}
	}

	console.log(
		`Fetched ${pageArray.length} pages with total rows of ${allData.length}.`,
	);

	return allData;
}
