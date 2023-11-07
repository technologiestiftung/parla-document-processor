import fs from "fs";
import Downloader from "nodejs-file-downloader";
import path from "path";
import pdf2img from "pdf-img-convert";
import { createWorker } from "tesseract.js";
import { ProcessedDocument, RegisteredDocument } from "./DocumentsProcessor.js";
import { getFileSize, getHash, splitPdf } from "../utils/utils.js";

export interface ExtractContract {
	document: RegisteredDocument;
	targetPath: string;
}

export interface ExtractionResult {
	document: RegisteredDocument;
	processedDocument: ProcessedDocument | undefined;
	pagesPath: string;
	fileSize: number;
	numPages: number;
	checksum: string;
}

export class DocumentExtractor {
	static async extract(contract: ExtractContract): Promise<ExtractionResult> {
		// Attention: order is important because "@opendocsg/pdf2md" sets a global "document" variable
		// which clashes with the createWorker() function because it then thinks it is inside a browser
		const worker = await createWorker("deu");
		// @ts-ignore
		const pdf2md = (await import("@opendocsg/pdf2md")).default;
		// End of attention

		const filename = contract.document.source_url.split("/").slice(-1)[0];

		const filenameWithoutExtension = filename.replace(".pdf", "");

		const subfolder = `${contract.targetPath}/${filenameWithoutExtension}`;
		fs.mkdirSync(subfolder);

		const pathToPdf = `${subfolder}/${filename}`;

		// @ts-ignore
		await new Downloader({
			url: contract.document.source_url,
			directory: subfolder,
			timeout: 100000,
		}).download();

		const pagesFolder = `${subfolder}/pages`;
		fs.mkdirSync(pagesFolder);

		await splitPdf(pathToPdf, filename, pagesFolder);

		const pdfPageFiles = fs
			.readdirSync(pagesFolder)
			.filter((file) => file.endsWith(".pdf"));

		for (let idx = 0; idx < pdfPageFiles.length; idx++) {
			const pdfPageFile = pdfPageFiles[idx];
			const pdfPage = pdfPageFile.replace(".pdf", "").split("-").slice(-1)[0];
			const pdfBuffer = fs.readFileSync(`${pagesFolder}/${pdfPageFile}`);

			let mdText = "";
			let ocrText = "";

			mdText = await pdf2md(pdfBuffer, null);

			// Fallback in case pdf2md fails to extract any text: Convert to Image, use OCR to extract text
			if (mdText.length < 32) {
				const image = await pdf2img.convert(`${pagesFolder}/${pdfPageFile}`, {
					width: 670 * 4,
					height: 950 * 4,
				});
				const pdfImagePage = pdfPageFile.replace(".pdf", ".png");
				fs.writeFileSync(pdfImagePage, image[0]);
				const extractionResult = await worker.recognize(pdfImagePage);
				fs.rmSync(pdfImagePage);
				ocrText = extractionResult.data.text;
			}

			let text = mdText.length < 32 ? ocrText : mdText;
			let outputFile = `${pagesFolder}/${filenameWithoutExtension}-${pdfPage}.md`;
			fs.writeFileSync(path.resolve(outputFile), text);
		}

		await worker.terminate();

		return {
			document: contract.document,
			processedDocument: undefined,
			pagesPath: pagesFolder,
			fileSize: getFileSize(pathToPdf),
			numPages: pdfPageFiles.length,
			checksum: getHash(pathToPdf),
		} as ExtractionResult;
	}
}
