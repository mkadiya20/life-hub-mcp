/**
 * R2 storage operations. Pure functions over an R2Bucket so they stay decoupled
 * from the MCP agent and easy to test.
 */
import { deserialize, type EntryType, type NutritionEntry, serialize } from "./entry";

const ENTRIES_PREFIX = "Trackers/Nutrition/entries";

/** Write one entry file. Returns the key it was written to. */
export async function putEntry(
	bucket: R2Bucket,
	key: string,
	entry: NutritionEntry,
): Promise<string> {
	await bucket.put(key, serialize(entry), {
		httpMetadata: { contentType: "text/markdown; charset=utf-8" },
	});
	return key;
}

/** Delete one entry file by key. */
export async function deleteEntry(bucket: R2Bucket, key: string): Promise<void> {
	await bucket.delete(key);
}

/** Load one entry file by key, or null if absent. */
export async function getEntry(bucket: R2Bucket, key: string): Promise<NutritionEntry | null> {
	const object = await bucket.get(key);
	if (!object) {
		return null;
	}
	return deserialize(await object.text());
}

/**
 * List entries whose logical date falls in [startDate, endDate] inclusive.
 *
 * Keys are `.../entries/{date}/{stem}.md`, so the date sorts lexically and we can
 * prefix-list per day rather than scan the whole bucket.
 */
export async function listEntries(
	bucket: R2Bucket,
	startDate: string,
	endDate: string,
	type?: EntryType,
): Promise<NutritionEntry[]> {
	const objects: R2Object[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix: `${ENTRIES_PREFIX}/`, cursor });
		objects.push(...page.objects);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);

	const inRange = objects.filter((o) => {
		const date = dateFromKey(o.key);
		return date !== null && date >= startDate && date <= endDate;
	});

	const entries = await Promise.all(
		inRange.map(async (o) => {
			const object = await bucket.get(o.key);
			return object ? deserialize(await object.text()) : null;
		}),
	);

	return entries
		.filter((e): e is NutritionEntry => e !== null && (!type || e.type === type))
		.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
}

/** Extract the logical date segment from an entry key. */
function dateFromKey(key: string): string | null {
	const match = key.match(/\/entries\/(\d{4}-\d{2}-\d{2})\//);
	return match ? match[1] : null;
}
