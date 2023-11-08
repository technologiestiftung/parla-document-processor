import { Settings } from "./interfaces/Settings.js";
import { DocumentsProcessor } from "./processor/DocumentsProcessor.js";
import { clearDirectory, splitArrayEqually } from "./utils/utils.js";

const BATCH_SIZE = 2;

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

const testBatch = unprocessedDocuments.slice(0, 5);

const batches = splitArrayEqually(testBatch, BATCH_SIZE);

for (let idx = 0; idx < batches.length; idx++) {
	const documentBatch = batches[idx];
	console.log(`Processing batch ${idx} / ${batches.length}`);
	await Promise.all(
		documentBatch.map(async (document) => {
			console.log(`Processing ${document.source_url} in batch ${idx}...`);
			const extractionResult = await processor.extract(document);
			await processor.summarize(extractionResult);
			await processor.embedd(extractionResult);
			await processor.finish(extractionResult);
		}),
	);
	clearDirectory(settings.processingDirectory);
}

process.exit(0);
