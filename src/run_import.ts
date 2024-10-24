import { settings } from "./Settings.js";
import { Importer } from "./importers/Importer.js";
import { RedNumberImporter } from "./importers/RedNumbers/RedNumberImporter.js";
import { SchrAnfrImporter } from "./importers/SchrAnfr/SchrAnfrImporter.js";
import { WebResourcesImporter } from "./importers/WebResources/WebResourcesImporter.js";

console.log(settings);

const schrAnfrImporter = new SchrAnfrImporter(settings);
const redNumbersImporter = new RedNumberImporter(settings);
const webResourcesImporter = new WebResourcesImporter(settings);
const importer = new Importer([
	schrAnfrImporter,
	redNumbersImporter,
	webResourcesImporter,
]);

await importer.import();

process.exit(0);
