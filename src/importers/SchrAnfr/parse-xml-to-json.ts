import { parseStringPromise } from "xml2js";
import { ParDoks } from "./common.js";

export async function parseXML2JSON(xml: string) {
	return (await parseStringPromise(xml, {
		explicitArray: true,
	})) as ParDoks;
}
