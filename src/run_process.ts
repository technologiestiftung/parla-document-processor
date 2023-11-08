import { DocumentsProcessor } from "./processor/DocumentsProcessor.js";
import { Importer } from "./Importer.js";
import { RedNumberImporter } from "./importers/RedNumbers/RedNumberImporter.js";
import { SchrAnfrImporter } from "./importers/SchrAnfr/SchrAnfrImporter.js";
import { Settings } from "./interfaces/Settings.js";

const settings = {
	postgresConnection: process.env.SUPABASE_DB_CONNECTION!,
	supabaseUrl: process.env.SUPABASE_URL!,
	supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
	openaAiApiKey: process.env.OPENAI_API_KEY!,
	maxPagesForSummary: parseInt(process.env.MAX_PAGES_FOR_SUMMARY!),
} as Settings;

const processor = new DocumentsProcessor(settings);

const unprocessedDocuments = await processor.find();

const testBatch = unprocessedDocuments.slice(0, 1);

for (let idx = 0; idx < testBatch.length; idx++) {
	const document = testBatch[idx];
	console.log(`Processing ${document.source_url}`);

	const extractionResult = await processor.extract(document);
	const summarizeResult = await processor.summarize(extractionResult);
	const embeddingResult = await processor.embedd(extractionResult);
}

process.exit(0);
