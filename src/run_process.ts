import { Settings } from "./interfaces/Settings.js";
import { ProcessingError } from "./processor/DocumentSummarizor.js";
import { DocumentsProcessor } from "./processor/DocumentsProcessor.js";
import { clearDirectory, splitArrayEqually, sumTokens } from "./utils/utils.js";

const BATCH_SIZE = 5;

const settings = {
	postgresConnection: process.env.SUPABASE_DB_CONNECTION!,
	supabaseUrl: process.env.SUPABASE_URL!,
	supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
	openaAiApiKey: process.env.OPENAI_API_KEY!,
	maxPagesForSummary: parseInt(process.env.MAX_PAGES_FOR_SUMMARY!),
	processingDirectory: process.env.PROCESSING_DIR!,
} as Settings;

const processor = new DocumentsProcessor(settings);

const unprocessedDocuments = await processor.find();

const batches = splitArrayEqually(unprocessedDocuments, BATCH_SIZE);

let embeddingTokenCount = 0;
let inputTokenCount = 0;
let outputTokenCount = 0;

for (let idx = 0; idx < batches.length; idx++) {
	const documentBatch = batches[idx];
	console.log(`Processing batch ${idx} / ${batches.length}`);
	await Promise.all(
		documentBatch.map(async (document) => {
			console.log(`Processing ${document.source_url} in batch ${idx}...`);
			const extractionResult = await processor.extract(document);

			try {
				const summarizeResult = await processor.summarize(extractionResult);
				const embeddingResult = await processor.embedd(extractionResult);
				await processor.finish(extractionResult);

				const tokens = sumTokens(summarizeResult, embeddingResult);

				embeddingTokenCount += tokens.embeddings;
				inputTokenCount += tokens.inputs;
				outputTokenCount += tokens.outputs;

				console.log(
					`Finished processing ${document.source_url} in batch ${idx} with inputTokens=${tokens.inputs} and outputTokens = ${tokens.outputs} and embeddingTokens = ${tokens.embeddings}`,
				);
			} catch (e) {
				if (e instanceof ProcessingError) {
					await processor.finishWithError(extractionResult, e.error);
					console.log(`Error processing ${document.source_url}: ${e.error}`);
				} else {
					await processor.finishWithError(extractionResult, JSON.stringify(e));
					console.log(
						`Error processing ${document.source_url}: ${JSON.stringify(e)}`,
					);
				}
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
