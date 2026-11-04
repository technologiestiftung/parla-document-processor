import { Settings } from "./interfaces/Common.js";
export const settings = {
	postgresConnection: process.env.SUPABASE_DB_CONNECTION!,
	supabaseUrl: process.env.SUPABASE_URL!,
	supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
	processingDirectory: process.env.PROCESSING_DIR!,
	allowDeletion: process.env.ALLOW_DELETION! === "true",
	maxPagesLimit: parseInt(process.env.MAX_PAGES_LIMIT!),
	maxPagesForLlmParseLimit: parseInt(
		process.env.MAX_PAGES_FOR_LLM_PARSE_LIMIT!,
	),
	llmApiKey: process.env.LLM_API_KEY!,
	llmBaseUrl: process.env.LLM_BASE_URL!,
	llmChatModel: process.env.LLM_CHAT_MODEL!,
	llmChatReasoningEffort: process.env.LLM_CHAT_REASONING_EFFORT,
	llmChatContextWindow: parseInt(process.env.LLM_CHAT_CONTEXT_WINDOW!),
	llmEmbeddingModel: process.env.LLM_EMBEDDING_MODEL!,
	maxDocumentsToProcessInOneRun: parseInt(
		process.env.MAX_DOCUMENTS_TO_PROCESS_IN_ONE_RUN!,
	),
	maxDocumentsToImportPerDocumentType: parseInt(
		process.env.MAX_DOCUMENTS_TO_IMPORT_PER_DOCUMENT_TYPE!,
	),
	llamaParseToken: process.env.LLAMA_PARSE_TOKEN!,
} as Settings;
