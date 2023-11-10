import { settings } from "./Settings.js";
import { DocumentsProcessor } from "./processor/DocumentsProcessor.js";
import {
	clearDirectory,
	handleError,
	splitArrayEqually,
	sumTokens,
} from "./utils/utils.js";
import fs from "fs";

const BATCH_SIZE = 20;

const processor = new DocumentsProcessor(settings);

const unprocessedDocuments = await processor.find();

// process.exit(0);
const batches = splitArrayEqually(
	unprocessedDocuments
		.filter((d) => d.source_url.includes("h19-0570-v.pdf"))
		.slice(0, 1), //TODO: remove
	BATCH_SIZE,
);

let embeddingTokenCount = 0;
let inputTokenCount = 0;
let outputTokenCount = 0;

for (let idx = 0; idx < batches.length; idx++) {
	const documentBatch = batches[idx];
	console.log(`Processing batch ${idx} / ${batches.length}`);
	await Promise.all(
		documentBatch.map(async (document) => {
			console.log(`Processing ${document.source_url} in batch ${idx}...`);
			try {
				const extractionResult = await processor.extract(document);

				try {
					const summarizeResult = await processor.summarize(extractionResult);
					const embeddingResult = await processor.embedd(extractionResult);
					await processor.finish(extractionResult.processedDocument!);

					const tokens = sumTokens(summarizeResult, embeddingResult);

					embeddingTokenCount += tokens.embeddings;
					inputTokenCount += tokens.inputs;
					outputTokenCount += tokens.outputs;

					console.log(
						`Finished processing ${document.source_url} in batch ${idx} with inputTokens=${tokens.inputs} and outputTokens = ${tokens.outputs} and embeddingTokens = ${tokens.embeddings}`,
					);
				} catch (e) {
					await handleError(
						e,
						document,
						extractionResult.processedDocument,
						processor,
					);
				}
			} catch (e) {
				await handleError(e, document, undefined, processor);
			}
		}),
	);
	clearDirectory(settings.processingDirectory);
}

// OpenAI pricing
// $0.0001 / 1K tokens ada v2 embedding
// gpt-3.5-turbo-1106	$0.0010 / 1K tokens input	$0.0020 / 1K tokens output
const estimatedCost =
	0.0001 * (embeddingTokenCount / 1000) +
	0.001 * (inputTokenCount / 1000) +
	0.002 * (outputTokenCount / 1000);

console.log(
	`Processing finished with inputTokens=${inputTokenCount} and outputTokens = ${outputTokenCount} and embeddingTokens = ${embeddingTokenCount} and estimatedCost = ${estimatedCost}$`,
);

process.exit(0);
