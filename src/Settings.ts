import { Settings } from "./interfaces/Common.js";
export const settings = {
	postgresConnection: process.env.SUPABASE_DB_CONNECTION!,
	supabaseUrl: process.env.SUPABASE_URL!,
	supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
	openaAiApiKey: process.env.OPENAI_API_KEY!,
	processingDirectory: process.env.PROCESSING_DIR!,
	allowDeletion: process.env.ALLOW_DELETION! === "true",
	maxPagesLimit: parseInt(process.env.MAX_PAGES_LIMIT!),
	openAiModel: process.env.OPENAI_MODEL!,
	openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL!,
	maxDocumentsToProcess: parseInt(process.env.MAX_DOCUMENTS_TO_PROCESS!),
} as Settings;
