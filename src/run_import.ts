import { Importer } from "./Importer.js";
import { RedNumberImporter } from "./importers/RedNumbers/RedNumberImporter.js";
import { SchrAnfrImporter } from "./importers/SchrAnfr/SchrAnfrImporter.js";
import { Settings } from "./interfaces/Settings.js";

const settings = {
	postgresConnection: process.env.SUPABASE_DB_CONNECTION!,
	supabaseUrl: process.env.SUPABASE_URL!,
	supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
} as Settings;

console.log(settings);

const schrAnfrImporter = new SchrAnfrImporter(settings);
const redNumbersImporter = new RedNumberImporter(settings);

const importer = new Importer([redNumbersImporter]);

await importer.import();

process.exit(0);
