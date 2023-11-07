import { parseStringPromise } from "xml2js";
import { ParDoks } from "./SchrAnfrTypes.js";

export async function parseXML2JSON(xml: string) {
	return (await parseStringPromise(xml, {
		explicitArray: true,
	})) as ParDoks;
}
