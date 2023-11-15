import { settings } from "./Settings.js";
import { Importer } from "./importers/Importer.js";
import { RedNumberImporter } from "./importers/RedNumbers/RedNumberImporter.js";
import { SchrAnfrImporter } from "./importers/SchrAnfr/SchrAnfrImporter.js";

console.log(settings);

const schrAnfrImporter = new SchrAnfrImporter(settings);
const redNumbersImporter = new RedNumberImporter(settings);

const importer = new Importer([schrAnfrImporter, redNumbersImporter]);

await importer.import();

process.exit(0);
