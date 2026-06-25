/**
 * Nutrition adapter: the typed body for log_meal. Validates LLM-supplied items,
 * sums entry totals, and builds the NutritionBody. Future entry types add a
 * sibling adapter; the envelope/store/read tools stay generic.
 */
import { z } from "zod";
import type { NutritionBody } from "./entry";

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
	input_text: z.string().min(1),
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

const sum = (items: LogMealInput["items"], pick: (i: LogMealInput["items"][number]) => number) =>
	items.reduce((total, item) => total + pick(item), 0);

/** Build a NutritionBody from validated input, deriving entry totals from the items. */
export function toNutritionBody(input: LogMealInput): NutritionBody {
	const hasCarbs = input.items.some((i) => i.carbs_g !== undefined);
	const hasFat = input.items.some((i) => i.fat_g !== undefined);
	return {
		meal: input.meal,
		calories: sum(input.items, (i) => i.calories),
		protein_g: sum(input.items, (i) => i.protein_g),
		carbs_g: hasCarbs ? sum(input.items, (i) => i.carbs_g ?? 0) : undefined,
		fat_g: hasFat ? sum(input.items, (i) => i.fat_g ?? 0) : undefined,
		confidence: input.confidence,
		input_text: input.input_text,
		items: input.items,
	};
}
