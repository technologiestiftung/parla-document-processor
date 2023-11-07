import { Settings } from "./Settings.js";

export interface DocumentImporter {
	documentType: string;
	settings: Settings;
	import(): Promise<number>;
}
