/**
 * Shared envelope + typed body. Every entry is a markdown file:
 * YAML frontmatter + a short human-readable body. The envelope is
 * identical across types; the body is owned by a per-type adapter.
 */
import { parse, stringify } from "yaml";
import { ulid } from "ulid";
import { entryStamp } from "./logical-date";

export type EntryType = "nutrition-entry";
export type Source = "claude";
export type Confidence = "low" | "medium" | "high";
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export interface Envelope {
	id: string; // ULID, internal identifier
	type: EntryType;
	date: string; // logical date, YYYY-MM-DD
	logged_at: string; // true UTC instant, ISO 8601
	source: Source;
}

export interface NutritionItem {
	name: string;
	qty: number;
	unit?: string;
	calories: number;
	protein_g: number;
	carbs_g?: number;
	fat_g?: number;
}

export interface NutritionBody {
	meal?: Meal;
	calories: number;
	protein_g: number;
	carbs_g?: number;
	fat_g?: number;
	confidence: Confidence;
	input_text: string;
	items: NutritionItem[];
}

export type NutritionEntry = Envelope & NutritionBody;

/** R2 key for an entry, mirroring the intended vault subpath. */
export function entryKey(type: EntryType, date: string, stem: string): string {
	const folder = type === "nutrition-entry" ? "Trackers/Nutrition" : type;
	return `${folder}/entries/${date}/${stem}.md`;
}

/** Build a fresh nutrition entry from a body, deriving envelope fields from the clock. */
export function createNutritionEntry(
	body: NutritionBody,
	explicitDate?: string,
	now: Date = new Date(),
): { entry: NutritionEntry; key: string; stem: string } {
	const { date: logicalNow, stem } = entryStamp(now);
	const date = explicitDate ?? logicalNow;
	const entry: NutritionEntry = {
		id: ulid(),
		type: "nutrition-entry",
		date,
		logged_at: now.toISOString(),
		source: "claude",
		...body,
	};
	return { entry, key: entryKey(entry.type, date, stem), stem };
}

const BODY_LINE = (e: NutritionEntry): string => {
	const label = e.meal ? `${e.meal[0].toUpperCase()}${e.meal.slice(1)} — ` : "";
	return `${label}${e.input_text}`;
};

/** Serialize an entry to a markdown file (YAML frontmatter + body line). */
export function serialize(entry: NutritionEntry): string {
	const frontmatter = stringify(entry).trimEnd();
	return `---\n${frontmatter}\n---\n\n${BODY_LINE(entry)}\n`;
}

/** Parse a markdown file back into an entry (frontmatter only; body is derived, not read). */
export function deserialize(markdown: string): NutritionEntry {
	const match = markdown.match(/^---\n([\s\S]*?)\n---/);
	if (!match) {
		throw new Error("Entry file has no YAML frontmatter");
	}
	return parse(match[1]) as NutritionEntry;
}
