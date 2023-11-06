import { Settings } from "../interfaces/DatabaseConnection.js";
import { DocumentImporter } from "../interfaces/DocumentImporter.js";

export class RedNumberImporter implements DocumentImporter {
	documentType: string = "Hauptausschussprotokoll";
	apiEndpoint: string = "https://www.parlament-berlin.de/api/v1";
	settings: Settings

	constructor(database: Settings) {
		this.settings = database
	}
	
	async import(): Promise<number> {
		console.log("Imported red numbers")
		return 1;
	}
}