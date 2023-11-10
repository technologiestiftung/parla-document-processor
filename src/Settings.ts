import { Settings } from "./interfaces/Common.js";
export const settings = {
	postgresConnection: process.env.SUPABASE_DB_CONNECTION!,
	supabaseUrl: process.env.SUPABASE_URL!,
	supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
	openaAiApiKey: process.env.OPENAI_API_KEY!,
	processingDirectory: process.env.PROCESSING_DIR!,
	allowDeletion: process.env.ALLOW_DELETION! === "true",
	maxPagesLimit: parseInt(process.env.MAX_PAGES_LIMIT!),
} as Settings;
