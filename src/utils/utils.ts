import crypto from "crypto";
import fs from "fs";
import { PDFDocument } from "pdf-lib";

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
