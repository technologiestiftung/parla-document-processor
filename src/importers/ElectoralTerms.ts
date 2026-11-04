// Electoral terms (Wahlperioden) to import.
// When a new electoral term starts, add it here as soon as its sources respond
// (otherwise the import fails). An empty source is fine as long as there are no
// documents of that term in the database yet. Keep the old ones: documents of
// electoral terms not listed here are not deleted (and no new ones are imported).
export const ELECTORAL_TERMS: Array<number> = [19, 20];
