import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";
import { settings } from "./Settings.js";
import { generateEmbedding } from "./utils/LlmUtils.js";

// Regenerates the embeddings of all chunks and summaries with the model set in LLM_EMBEDDING_MODEL
// and stores them in embedding_temp / summary_embedding_temp. The existing texts are reused,
// nothing is re-extracted or re-summarized. Only rows with an empty *_temp column are processed,
// so failed rows are retried when the script is run again.
// The *_temp columns must be emptied and have the dimension of the new model beforehand
// (migration in parla-api).

console.log(
	`Regenerating embeddings with model ${settings.llmEmbeddingModel} via ${settings.llmBaseUrl}`,
);

const BATCH_SIZE = 20;
// Dimension of the *_temp columns, must match the embedding model (mistral-embed-2312)
const EMBEDDING_DIMENSION = 1024;

const supabase = createClient(
	settings.supabaseUrl,
	settings.supabaseServiceRoleKey,
);

const llm = new OpenAI({
	apiKey: settings.llmApiKey,
	baseURL: settings.llmBaseUrl,
});

// Test call without retry, so a wrong key, model or base URL aborts immediately
// instead of every row failing after all retries in generateEmbedding
try {
	const testResponse = await llm.embeddings.create({
		model: settings.llmEmbeddingModel,
		input: "Test",
	});
	const dimension = testResponse.data[0].embedding.length;
	if (dimension !== EMBEDDING_DIMENSION) {
		console.log(
			`Test embedding has ${dimension} dimensions, expected ${EMBEDDING_DIMENSION}, aborting`,
		);
		process.exit(1);
	}
	console.log(`Test embedding ok (${dimension} dimensions)`);
} catch (e) {
	console.log(`Test embedding failed, aborting: ${e}`);
	process.exit(1);
}

let embeddingTokenCount = 0;
const failures: Array<{
	table: string;
	id: number;
	processedDocumentId: number;
	reason: string;
}> = [];

async function regenerateEmbeddings(
	table: string,
	textColumn: string,
	embeddingColumn: string,
) {
	let processedRowCount = 0;
	// Rows are read in id order, so failed rows (still empty) are skipped in this run
	let lastId = 0;
	for (;;) {
		const { data: rows, error } = await supabase
			.from(table)
			.select(`id, processed_document_id, text:${textColumn}`)
			.is(embeddingColumn, null)
			.gt("id", lastId)
			.order("id", { ascending: true })
			.limit(BATCH_SIZE)
			.returns<
				Array<{ id: number; processed_document_id: number; text: string }>
			>();

		if (error) {
			throw new Error(`Error reading ${table}: ${error.message}`);
		}
		if (rows.length === 0) {
			break;
		}
		lastId = rows[rows.length - 1].id;

		await Promise.all(
			rows.map(async (row) => {
				try {
					const { embedding, tokenUsage } = await generateEmbedding(
						row.text,
						llm,
					);
					const { error } = await supabase
						.from(table)
						.update({ [embeddingColumn]: embedding })
						.eq("id", row.id);
					if (error) {
						throw new Error(`Error updating row: ${error.message}`);
					}
					embeddingTokenCount += tokenUsage;
					processedRowCount++;
				} catch (e) {
					console.log(
						`Error regenerating embedding for ${table} id=${row.id} (processed document ${row.processed_document_id}): ${e}`,
					);
					failures.push({
						table: table,
						id: row.id,
						processedDocumentId: row.processed_document_id,
						reason: `${e}`,
					});
				}
			}),
		);

		console.log(
			`${table}: ${processedRowCount} rows done, ${embeddingTokenCount} embedding tokens so far`,
		);
	}
}

await regenerateEmbeddings(
	"processed_document_chunks",
	"content",
	"embedding_temp",
);
await regenerateEmbeddings(
	"processed_document_summaries",
	"summary",
	"summary_embedding_temp",
);

// Attention:
// After swapping the *_temp columns with the main columns, the indices must be regenerated.

// Mistral pricing as of 2026-11-03: https://mistral.ai/pricing
// mistral-embed-2312: $0.085 / 1M tokens
const estimatedCost = 0.085 * (embeddingTokenCount / 1_000_000);

console.log(
	`Processing finished with embeddingTokens = ${embeddingTokenCount} and estimatedCost = ${estimatedCost}$ (price as of 2026-11-03 for mistral-embed-2312, model used: ${settings.llmEmbeddingModel})`,
);

if (failures.length > 0) {
	console.log(
		`${failures.length} rows failed (still empty, retried on the next run):`,
	);
	console.table(failures);
}

process.exit(0);
