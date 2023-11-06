import { Settings } from "./DatabaseConnection.js";

export interface DocumentImporter {
	documentType: string;
	settings:Settings;
	import(): Promise<number>;
}