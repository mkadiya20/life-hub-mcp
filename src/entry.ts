/**
 * Shared envelope + typed body. Every entry is a markdown file (YAML frontmatter + body
 * line); the envelope is common to all types, the body owned by a per-type adapter.
 */
import { parse, stringify } from "yaml";
import { ulid } from "ulid";
import { logicalDate, logicalTimeStamp } from "./logical-date";

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

/** Reconstruct the full R2 key from a stem (`{date}-{HHMMSS}`); the date is embedded in it. */
export function keyFromStem(type: EntryType, stem: string): string {
	const match = stem.match(/^(\d{4}-\d{2}-\d{2})-\d{6}$/);
	if (!match) {
		throw new Error(`Invalid entry key "${stem}" (expected YYYY-MM-DD-HHMMSS)`);
	}
	return entryKey(type, match[1], stem);
}

/** Build a fresh nutrition entry from a body, deriving envelope fields from the clock. */
export function createNutritionEntry(
	body: NutritionBody,
	explicitDate?: string,
	now: Date = new Date(),
): { entry: NutritionEntry; key: string; stem: string } {
	// HHMMSS is the real logging time; the date prefix follows the chosen date so the
	// stem and its folder always agree (an explicit backfill date must not desync them).
	const date = explicitDate ?? logicalDate(now);
	const stem = `${date}-${logicalTimeStamp(now)}`;
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
