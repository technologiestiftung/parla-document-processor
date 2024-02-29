import { createClient } from "@supabase/supabase-js";
import { settings } from "./Settings.js";
import {
	clearDirectory,
	handleError,
	splitArrayEqually,
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

for (let idx = 0; idx < batches.length; idx++) {
	const documentBatch = batches[idx];
	console.log(`Processing batch ${idx} / ${batches.length}`);
	await Promise.all(
		documentBatch.map(async (document) => {
			console.log(`Processing ${document.source_url} in batch ${idx}...`);
			try {
				try {
					const embeddingResult = await processor.regenerateChunksEmbeddings(
						document,
					);

					const summaryEmbedding = await processor.regenerateSummaryEmbeddings(
						document,
					);

					const tokens =
						embeddingResult.tokenUsage + summaryEmbedding.tokenUsage;
					embeddingTokenCount += tokens;

					console.log(
						`Finished processing ${document.source_url} in batch ${idx} with and embeddingTokens = ${tokens}`,
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

// OpenAI pricing
// https://openai.com/pricing
// https://openai.com/pricing / 1K tokens for text-embedding-3-small
const estimatedCost = 0.00002 * (embeddingTokenCount / 1000);

console.log(
	`Processing finished with embeddingTokens = ${embeddingTokenCount} and estimatedCost = ${estimatedCost}$`,
);

process.exit(0);
