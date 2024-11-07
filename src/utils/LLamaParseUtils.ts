import { settings } from "./../Settings.js";
import fs from "fs";

// Using a UUID as a separator to split the pages
// As it is highly unlikely (virtually impossible) to appear in the text, we can safely use it as a separator
export const PAGE_SEPARATOR = "3c579d32-abcc-4cab-bd6c-88ce8d754037";

// Timeout in seconds for the markdown extraction
const TIMEOUT_SECONDS = 300;

async function uploadFileToLLamaParse(filePath: string) {
	const fileBlob = fs.readFileSync(filePath);
	const blob = new Blob([fileBlob]);

	const headers = new Headers();
	headers.append("Authorization", `Bearer ${settings.llamaParseToken}`);

	const formdata = new FormData();
	formdata.append("file", blob, filePath);
	formdata.append("page_separator", PAGE_SEPARATOR);
	formdata.append("language", "de");
	formdata.append("accurate_mode", "true"); // Pricing info: https://docs.cloud.llamaindex.ai/llamaparse/usage_data

	const requestOptions = {
		method: "POST",
		headers: headers,
		body: formdata,
	};

	const res = await fetch(
		"https://api.cloud.llamaindex.ai/api/parsing/upload",
		requestOptions,
	);

	const body = await res.json();

	console.log(body);

	return body;
}

async function checkParsingStatus(jobId: string) {
	const headers = new Headers();
	headers.append("Authorization", `Bearer ${settings.llamaParseToken}`);

	const requestOptions = {
		method: "GET",
		headers: headers,
	};

	const res = await fetch(
		`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`,
		requestOptions,
	);

	const body = await res.json();
	return body;
}

async function fetchMarkdown(jobId: string) {
	const headers = new Headers();
	headers.append("Authorization", `Bearer ${settings.llamaParseToken}`);

	const requestOptions = {
		method: "GET",
		headers: headers,
	};

	const res = await fetch(
		`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
		requestOptions,
	);

	const body = await res.json();

	return body.markdown;
}

export async function extractMarkdownViaLLamaParse(filePath: string) {
	console.log(
		`Uploading file ${filePath} to LLamaParse for markdown extraction...`,
	);
	const uploadRes = await uploadFileToLLamaParse(filePath);
	let statusRes = await checkParsingStatus(uploadRes.id);
	console.log(
		`Waiting for file ${filePath} to complete markdown extraction via LlamaParse...`,
	);
	const then = Date.now();
	while (statusRes.status !== "SUCCESS") {
		statusRes = await checkParsingStatus(uploadRes.id);
		console.log(
			`Status of file ${filePath} (ID: ${uploadRes.id}): ${statusRes.status}...`,
		);
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// To avoid infinite loop, we will throw an error if it takes too long
		const elapsedSeconds = (Date.now() - then) / 1000;
		if (elapsedSeconds > TIMEOUT_SECONDS) {
			throw new Error(
				`File ${filePath} took too long to complete markdown extraction via LLamaParse...`,
			);
		}

		if (statusRes.status === "ERROR") {
			throw new Error(
				`File ${filePath} failed to complete markdown extraction via LLamaParse...`,
			);
		}
	}

	const markdown = await fetchMarkdown(uploadRes.id);
	console.log(
		`File ${filePath} completed markdown extraction via LLamaParse...`,
	);
	return markdown;
}
