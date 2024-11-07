import fs from "fs";
import Downloader from "nodejs-file-downloader";
import path from "path";
import {
	ExtractedFile,
	ExtractionResult,
	ExtractRequest,
	RegisteredDocument,
	Settings,
} from "../interfaces/Common.js";
import { enc, getFileSize, getHash, splitPdf } from "../utils/utils.js";
// @ts-ignore
import pdf from "pdf-page-counter";
import puppeteer from "puppeteer";
import {
	extractMarkdownViaLLamaParse,
	PAGE_SEPARATOR,
} from "../utils/LLamaParseUtils.js";

import pdf2img from "pdf-img-convert";
import { createWorker } from "tesseract.js";

const MAGIC_TIMEOUT = 100000;

const MAGIC_TEXT_TOO_SHORT_LENGTH = 32;
const MAGIC_OCR_WIDTH = 2048;
const MAGIC_OCR_HEIGHT = 2887;

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
		settings: Settings,
	): Promise<ExtractionResult> {
		// Attention: order is important because "@opendocsg/pdf2md" sets a global "document" variable
		// which clashes with the createWorker() function because it then thinks it is inside a browser
		const worker = await createWorker("deu");
		// @ts-ignore
		const pdf2md = (await import("@opendocsg/pdf2md")).default;
		// End of attention

		let filename = extractRequest.document.source_url.split("/").slice(-1)[0];
		if (!filename.endsWith(".pdf")) {
			filename += ".pdf";
		}
		const filenameWithoutExtension = filename.replace(".pdf", "");

		const subfolder = `${extractRequest.targetPath}/${filenameWithoutExtension}`;
		if (!fs.existsSync(subfolder)) {
			fs.mkdirSync(subfolder);
		}

		const pathToPdf = `${subfolder}/${filename}`;

		if (extractRequest.document.source_type === "Webseite") {
			// Documents of type "Webseite" must be converted to PDF first, they cannot be downloaded directly
			// After that, they are treated identically as all other documents
			const browser = await puppeteer.launch();
			const page = await browser.newPage();
			await page.goto(extractRequest.document.source_url);
			// Make sure that the page is fully loaded by waiting for network idle and additionally wating for 2 seconds
			await page.waitForNetworkIdle();
			await new Promise((r) => setTimeout(r, 2000));
			await page.pdf({ path: pathToPdf, format: "A4" });
			await browser.close();
		} else {
			// @ts-ignore
			await new Downloader({
				url: extractRequest.document.source_url,
				directory: subfolder,
				timeout: MAGIC_TIMEOUT,
			}).download();
		}

		const pagesFolder = `${subfolder}/pages`;
		if (!fs.existsSync(pagesFolder)) {
			fs.mkdirSync(pagesFolder);
		}

		let dataBuffer = fs.readFileSync(pathToPdf);
		const pdfStat = await pdf(dataBuffer);
		const numPages = pdfStat.numpages;
		if (numPages > settings.maxPagesLimit) {
			throw new ExtractError(
				extractRequest.document,
				`Could not extract ${extractRequest.document.source_url}, num pages ${numPages} > limit of ${settings.maxPagesLimit} pages.`,
			);
		}

		await splitPdf(pathToPdf, filename, pagesFolder);

		const pdfPageFiles = fs
			.readdirSync(pagesFolder)
			.filter((file) => file.endsWith(".pdf"));

		let extractedFiles: Array<ExtractedFile> = [];

		if (numPages <= settings.maxPagesForLlmParseLimit) {
			console.log(
				`Extracting via LLamaParse (num pages ${numPages} <= limit of ${settings.maxPagesForLlmParseLimit})...`,
			);
			const mdText = await extractMarkdownViaLLamaParse(pathToPdf);
			const mdPages = mdText.split(PAGE_SEPARATOR);
			for (let idx = 0; idx < mdPages.length; idx++) {
				const mdPage = mdPages[idx];
				let outputFile = `${pagesFolder}/${filenameWithoutExtension}-${idx}.md`;
				let outPath = path.resolve(outputFile);
				fs.writeFileSync(outPath, mdPage, { encoding: "utf8" });

				extractedFiles.push({
					page: idx,
					path: outPath,
					tokens: enc.encode(mdPage).length,
				} as ExtractedFile);
			}
		} else {
			console.log(
				`Extracting via pdf2md (num pages ${numPages} > limit of ${settings.maxPagesForLlmParseLimit})...`,
			);
			for (let idx = 0; idx < pdfPageFiles.length; idx++) {
				const pdfPageFile = pdfPageFiles[idx];
				const pdfPage = pdfPageFile.replace(".pdf", "").split("-").slice(-1)[0];
				const pdfBuffer = fs.readFileSync(`${pagesFolder}/${pdfPageFile}`);

				let mdText = "";
				let ocrText = "";

				// @ts-ignore
				mdText = await pdf2md(new Uint8Array(pdfBuffer), null);

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
					tokens: enc.encode(text).length,
				} as ExtractedFile);
			}
		}

		return {
			document: extractRequest.document,
			processedDocument: undefined,
			pagesPath: pagesFolder,
			fileSize: getFileSize(pathToPdf),
			numPages: pdfPageFiles.length,
			checksum: getHash(pathToPdf),
			extractedFiles: extractedFiles,
			totalTokens: extractedFiles
				.map((f) => f.tokens)
				.reduce((l, r) => l + r, 0),
		} as ExtractionResult;
	}
}
