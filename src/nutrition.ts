/**
 * Nutrition adapter: the typed body for log_meal. Validates LLM-supplied items,
 * sums entry totals, and builds the NutritionBody. Future entry types add a
 * sibling adapter; the envelope/store/read tools stay generic.
 */
import { z } from "zod";
import type { NutritionBody, NutritionEntry } from "./entry";

export const mealSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const itemSchema = z.object({
	name: z.string().min(1),
	qty: z.number().positive(),
	unit: z.string().min(1).optional(),
	calories: z.number().nonnegative(),
	protein_g: z.number().nonnegative(),
	carbs_g: z.number().nonnegative().optional(),
	fat_g: z.number().nonnegative().optional(),
});

/** Raw shape of log_meal input (the LLM fills these in). */
export const logMealInput = {
	items: z.array(itemSchema).min(1),
	meal: mealSchema.optional(),
	confidence: confidenceSchema.default("medium"),
	input_text: z
		.string()
		.min(1)
		.describe(
			"The user's original message, verbatim. Do not paraphrase, summarize, or clean it up.",
		),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
		.optional(),
};

export type LogMealInput = {
	items: z.infer<typeof itemSchema>[];
	meal?: z.infer<typeof mealSchema>;
	confidence: z.infer<typeof confidenceSchema>;
	input_text: string;
	date?: string;
};

type Item = z.infer<typeof itemSchema>;

const sum = (items: Item[], pick: (i: Item) => number) =>
	items.reduce((total, item) => total + pick(item), 0);

/** Entry-level macro totals derived by summing items. Optional macros stay undefined
 * unless at least one item reports them (so "unknown" is not stored as 0). */
function deriveTotals(
	items: Item[],
): Pick<NutritionBody, "calories" | "protein_g" | "carbs_g" | "fat_g"> {
	const hasCarbs = items.some((i) => i.carbs_g !== undefined);
	const hasFat = items.some((i) => i.fat_g !== undefined);
	return {
		calories: sum(items, (i) => i.calories),
		protein_g: sum(items, (i) => i.protein_g),
		carbs_g: hasCarbs ? sum(items, (i) => i.carbs_g ?? 0) : undefined,
		fat_g: hasFat ? sum(items, (i) => i.fat_g ?? 0) : undefined,
	};
}

/** Build a NutritionBody from validated input, deriving entry totals from the items. */
export function toNutritionBody(input: LogMealInput): NutritionBody {
	return {
		meal: input.meal,
		...deriveTotals(input.items),
		confidence: input.confidence,
		input_text: input.input_text,
		items: input.items,
	};
}

/** Fields editable via edit_entry. Everything else (id, type, date, logged_at, source,
 * input_text) is immutable. */
export const editNutritionInput = {
	items: z.array(itemSchema).min(1).optional(),
	meal: mealSchema.optional(),
	confidence: confidenceSchema.optional(),
};

export type EditNutritionInput = {
	items?: Item[];
	meal?: z.infer<typeof mealSchema>;
	confidence?: z.infer<typeof confidenceSchema>;
};

/** Apply an edit to an existing entry: overwrite editable fields, recompute totals if
 * items changed. Returns a new entry; the caller persists it. */
export function applyNutritionEdit(
	entry: NutritionEntry,
	patch: EditNutritionInput,
): NutritionEntry {
	const items = patch.items ?? entry.items;
	return {
		...entry,
		meal: patch.meal ?? entry.meal,
		confidence: patch.confidence ?? entry.confidence,
		items,
		...deriveTotals(items),
	};
}

export interface DailyTotal {
	date: string;
	entries: number;
	calories: number;
	protein_g: number;
	carbs_g: number;
	fat_g: number;
}

/** Roll up entries into per-day macro totals, sorted by date. Days with no entries are
 * omitted (this is a summary of what was logged, not a calendar). */
export function dailyTotals(entries: NutritionEntry[]): DailyTotal[] {
	const byDate = new Map<string, DailyTotal>();
	for (const e of entries) {
		const day = byDate.get(e.date) ?? {
			date: e.date,
			entries: 0,
			calories: 0,
			protein_g: 0,
			carbs_g: 0,
			fat_g: 0,
		};
		day.entries += 1;
		day.calories += e.calories;
		day.protein_g += e.protein_g;
		day.carbs_g += e.carbs_g ?? 0;
		day.fat_g += e.fat_g ?? 0;
		byDate.set(e.date, day);
	}
	return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
