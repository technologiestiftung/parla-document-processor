import { DocumentImporter } from "./interfaces/DocumentImporter.js";

export class Importer {
	importers: Array<DocumentImporter>;

	constructor(importers: Array<DocumentImporter>) {
		this.importers = importers;
	}

	async import() {
		for (let idx = 0; idx < this.importers.length; idx++) {
			const importer = this.importers[idx];
			await importer.import();
		}
	}
}