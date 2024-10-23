import fs from "fs";

// Using a UUID as a separator to split the pages
// As it is highly unlikely (virtually impossible) to appear in the text, we can safely use it as a separator
export const PAGE_SEPARATOR = "3c579d32-abcc-4cab-bd6c-88ce8d754037";

async function uploadFileToLLamaParse(filePath: string) {
	const fileBlob = fs.readFileSync(filePath);
	const blob = new Blob([fileBlob]);

	const myHeaders = new Headers();
	myHeaders.append("Authorization", `Bearer ${process.env.LLAMA_PARSE_TOKEN}`);

	const formdata = new FormData();
	formdata.append("file", blob, filePath);
	formdata.append("page_separator", PAGE_SEPARATOR);

	const requestOptions = {
		method: "POST",
		headers: myHeaders,
		body: formdata,
	};

	const res = await fetch(
		"https://api.cloud.llamaindex.ai/api/parsing/upload",
		requestOptions,
	);

	const body = await res.json();

	return body;
}

async function checkParsingStatus(jobId: string) {
	const myHeaders = new Headers();
	myHeaders.append("Authorization", `Bearer ${process.env.LLAMA_PARSE_TOKEN}`);

	const requestOptions = {
		method: "GET",
		headers: myHeaders,
	};

	const res = await fetch(
		`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`,
		requestOptions,
	);

	const body = await res.json();
	return body;
}

async function fetchMarkdown(jobId: string) {
	const myHeaders = new Headers();
	myHeaders.append("Authorization", `Bearer ${process.env.LLAMA_PARSE_TOKEN}`);

	const requestOptions = {
		method: "GET",
		headers: myHeaders,
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
	while (statusRes.status !== "SUCCESS") {
		statusRes = await checkParsingStatus(uploadRes.id);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	const markdown = await fetchMarkdown(uploadRes.id);
	console.log(
		`File ${filePath} completed markdown extraction via LLamaParse...`,
	);
	return markdown;
}
