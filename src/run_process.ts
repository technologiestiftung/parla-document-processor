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

const extractionResults = await processor.extract(unprocessedDocuments);

const test = await processor.summarize(extractionResults);

process.exit(0);
