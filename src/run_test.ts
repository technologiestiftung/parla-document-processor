import { extractMarkdownViaLLamaParse } from "./utils/LLamaParseUtils.js";

const filePath = "./S19-10124-short.pdf";

await extractMarkdownViaLLamaParse(filePath);
