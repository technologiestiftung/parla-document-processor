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

const MAGIC_TIMEOUT = 100000;

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
		const filename = extractRequest.document.source_url.split("/").slice(-1)[0];

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
		const mdText = await extractMarkdownViaLLamaParse(pathToPdf);
		const mdPages = mdText.split(PAGE_SEPARATOR);

		for (let idx = 0; idx < mdPages.length; idx++) {
			const mdPage = mdPages[idx];
			let outputFile = `${pagesFolder}/${filenameWithoutExtension}-${idx}.md`;
			let outPath = path.resolve(outputFile);
			console.log(mdPage);
			fs.writeFileSync(outPath, mdPage, { encoding: "utf8" });

			extractedFiles.push({
				page: idx,
				path: outPath,
				tokens: enc.encode(mdPage).length,
			} as ExtractedFile);
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
