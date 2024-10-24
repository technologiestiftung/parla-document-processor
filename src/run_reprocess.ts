import { createClient } from "@supabase/supabase-js";
import { settings } from "./Settings.js";
import {
	clearDirectory,
	handleError,
	splitArrayEqually,
	sumTokens,
} from "./utils/utils.js";
import { DocumentsProcessor } from "./processor/DocumentsProcessor.js";
import { RegisteredDocument } from "./interfaces/Common.js";

console.log(settings);

const BATCH_SIZE = 20;

const processor = new DocumentsProcessor(settings);

const supabase = createClient(
	settings.supabaseUrl,
	settings.supabaseServiceRoleKey,
);

let { data, error } = await supabase
	.from("registered_documents")
	.select("id, source_url, source_type, registered_at, metadata")
	.order("id", { ascending: false })
	.returns<Array<RegisteredDocument>>();

const documentsToProcess = data!.slice(
	0,
	settings.maxDocumentsToProcessInOneRun,
);

const batches = splitArrayEqually(documentsToProcess, BATCH_SIZE);

console.log(
	`Processing ${documentsToProcess.length} documents in ${batches.length} batches of size ${BATCH_SIZE}...`,
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
				const extractionResult = await processor.reextract(document);

				try {
					const summarizeResult = await processor.resummarize(extractionResult);
					const embeddingResult = await processor.reembedd(extractionResult);

					const tokens = sumTokens(summarizeResult, embeddingResult);

					embeddingTokenCount += tokens.embeddings;
					inputTokenCount += tokens.inputs;
					outputTokenCount += tokens.outputs;

					console.log(
						`Finished processing ${document.source_url} in batch ${idx} with inputTokens=${tokens.inputs} and outputTokens = ${tokens.outputs} and embeddingTokens = ${tokens.embeddings}`,
					);
				} catch (e) {
					await handleError(e, document, undefined, processor);
				}
			} catch (e) {
				await handleError(e, document, undefined, processor);
			}
		}),
	);
	clearDirectory(settings.processingDirectory);
}

// Attention:
// Upon arrival of new data, the indices on database tables must be regenerated.
// This can be done periodically by defining cron jobs in the database using pg_cron.

// OpenAI pricing: https://openai.com/api/pricing/
// $0.100 / 1M tokens tokens ada v2 embedding
// gpt-4o-mini $0.150 / 1M input tokens, $0.600 / 1M output tokens
const estimatedCost =
	0.1 * (embeddingTokenCount / 1_000_000) +
	0.15 * (inputTokenCount / 1_000_000) +
	0.6 * (outputTokenCount / 1_000_000);

console.log(
	`Processing finished with inputTokens=${inputTokenCount} and outputTokens = ${outputTokenCount} and embeddingTokens = ${embeddingTokenCount} and estimatedCost = ${estimatedCost}$`,
);

process.exit(0);
