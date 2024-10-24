import { settings } from "./Settings.js";
import { Importer } from "./importers/Importer.js";
import { RedNumberImporter } from "./importers/RedNumbers/RedNumberImporter.js";
import { SchrAnfrImporter } from "./importers/SchrAnfr/SchrAnfrImporter.js";
import { WebResourcesImporter } from "./importers/WebResources/WebResourcesImporter.js";
import { TestResourcesImporter } from "./importers/TestResources/TestResourcesImporter.js";

console.log(settings);

const schrAnfrImporter = new SchrAnfrImporter(settings);
// const redNumbersImporter = new RedNumberImporter(settings);
// const webResourcesImporter = new WebResourcesImporter(settings);
// const testResourcesImporter = new TestResourcesImporter(settings);
const importer = new Importer([
	schrAnfrImporter,
	// redNumbersImporter,
	// webResourcesImporter,
	// testResourcesImporter,
]);

await importer.import();

process.exit(0);
