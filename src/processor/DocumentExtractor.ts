import fs from "fs";
import Downloader from "nodejs-file-downloader";
import path from "path";
import pdf2img from "pdf-img-convert";
import { createWorker } from "tesseract.js";
import { getFileSize, getHash, splitPdf } from "../utils/utils.js";
import {
	ExtractRequest,
	ExtractedFile,
	ExtractionResult,
	RegisteredDocument,
} from "../interfaces/Common.js";
// @ts-ignore
import pdf from "pdf-page-counter";

const MAGIC_TEXT_TOO_SHORT_LENGTH = 32;
const MAGIC_OCR_WIDTH = 2048;
const MAGIC_OCR_HEIGHT = 2887;
const MAGIC_TIMEOUT = 100000;
const MAGIC_PAGES_LIMIT = 100;

export class ExtractError extends Error {
	document: RegisteredDocument;
	error: string;
	constructor(document: RegisteredDocument, error: string) {
		super();
		this.document = document;
		this.error = error;
	}
}

export class DocumentExtractor {
	static async extract(
		extractRequest: ExtractRequest,
	): Promise<ExtractionResult> {
		// Attention: order is important because "@opendocsg/pdf2md" sets a global "document" variable
		// which clashes with the createWorker() function because it then thinks it is inside a browser
		const worker = await createWorker("deu");
		// @ts-ignore
		const pdf2md = (await import("@opendocsg/pdf2md")).default;
		// End of attention

		const filename = extractRequest.document.source_url.split("/").slice(-1)[0];

		const filenameWithoutExtension = filename.replace(".pdf", "");

		const subfolder = `${extractRequest.targetPath}/${filenameWithoutExtension}`;
		fs.mkdirSync(subfolder);

		const pathToPdf = `${subfolder}/${filename}`;

		// @ts-ignore
		await new Downloader({
			url: extractRequest.document.source_url,
			directory: subfolder,
			timeout: MAGIC_TIMEOUT,
		}).download();

		const pagesFolder = `${subfolder}/pages`;
		fs.mkdirSync(pagesFolder);

		// let dataBuffer = fs.readFileSync(pathToPdf);
		// const pdfStat = await pdf(dataBuffer);
		// const numPages = pdfStat.numpages;
		// if (numPages > MAGIC_PAGES_LIMIT) {
		// 	throw new ExtractError(
		// 		extractRequest.document,
		// 		`Could not extract ${extractRequest.document.source_url}, num pages ${numPages} > limit of ${MAGIC_PAGES_LIMIT} pages.`,
		// 	);
		// }

		await splitPdf(pathToPdf, filename, pagesFolder);

		const pdfPageFiles = fs
			.readdirSync(pagesFolder)
			.filter((file) => file.endsWith(".pdf"));

		let extractedFiles: Array<ExtractedFile> = [];
		for (let idx = 0; idx < pdfPageFiles.length; idx++) {
			const pdfPageFile = pdfPageFiles[idx];
			const pdfPage = pdfPageFile.replace(".pdf", "").split("-").slice(-1)[0];
			const pdfBuffer = fs.readFileSync(`${pagesFolder}/${pdfPageFile}`);

			let mdText = "";
			let ocrText = "";

			mdText = await pdf2md(pdfBuffer, null);

			// Fallback in case pdf2md fails to extract any text: Convert to Image, use OCR to extract text
			if (mdText.length < MAGIC_TEXT_TOO_SHORT_LENGTH) {
				const image = await pdf2img.convert(`${pagesFolder}/${pdfPageFile}`, {
					width: MAGIC_OCR_WIDTH,
					height: MAGIC_OCR_HEIGHT,
				});
				const pdfImagePage = pdfPageFile.replace(".pdf", ".png");
				fs.writeFileSync(pdfImagePage, image[0]);
				const extractionResult = await worker.recognize(pdfImagePage);
				fs.rmSync(pdfImagePage);
				ocrText = extractionResult.data.text;
			}

			let text = mdText.length < 32 ? ocrText : mdText;
			let outputFile = `${pagesFolder}/${filenameWithoutExtension}-${pdfPage}.md`;
			let outPath = path.resolve(outputFile);
			fs.writeFileSync(outPath, text);

			extractedFiles.push({
				page: parseInt(pdfPage),
				path: outPath,
			} as ExtractedFile);
		}

		await worker.terminate();

		return {
			document: extractRequest.document,
			processedDocument: undefined,
			pagesPath: pagesFolder,
			fileSize: getFileSize(pathToPdf),
			numPages: pdfPageFiles.length,
			checksum: getHash(pathToPdf),
			extractedFiles: extractedFiles,
		} as ExtractionResult;
	}
}
