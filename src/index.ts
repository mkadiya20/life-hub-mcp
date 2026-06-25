import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { createNutritionEntry, type EntryType, keyFromStem } from "./entry";
import { GitHubHandler } from "./github-handler";
import {
	applyNutritionEdit,
	dailyTotals,
	editNutritionInput,
	logMealInput,
	toNutritionBody,
} from "./nutrition";
import type { Props } from "./oauth-utils";
import { deleteEntry, getEntry, listEntries, putEntry } from "./store";

const NUTRITION: EntryType = "nutrition-entry";
const json = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const entryTypeSchema = z.enum(["nutrition-entry"]);
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

// Only these GitHub logins may use the server at all. Single-user: add your username.
const ALLOWED_USERNAMES = new Set<string>(["mkadiya20"]);

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Life Hub",
		version: "0.1.0",
	});

	private get bucket(): R2Bucket {
		return this.env.BUCKET;
	}

	async init() {
		// Fail closed: an authenticated-but-unlisted user gets no tools.
		if (!ALLOWED_USERNAMES.has(this.props!.login)) {
			return;
		}

		this.server.registerTool(
			"log_meal",
			{
				description:
					"Log a meal as one immutable nutrition entry. Provide per-item macros " +
					"(you estimate them); totals are derived. Pass the user's message verbatim " +
					"as `input_text` (do not paraphrase or clean it up — it is the audit record). " +
					"Omit `date` to log for now (6am-Toronto logical date); pass an explicit " +
					"date for backfilling.",
				inputSchema: logMealInput,
			},
			async (input) => {
				const body = toNutritionBody(input);
				const { entry, key } = createNutritionEntry(body, input.date);
				await putEntry(this.bucket, key, entry);
				return json({ key, entry });
			},
		);

		this.server.registerTool(
			"get_entries",
			{
				description:
					"Fetch entries whose logical date is in [start_date, end_date] inclusive, " +
					"as compact JSON for analysis. Optionally filter by type.",
				inputSchema: {
					start_date: dateArg,
					end_date: dateArg,
					type: entryTypeSchema.optional(),
				},
			},
			async ({ start_date, end_date, type }) => {
				const entries = await listEntries(
					this.bucket,
					start_date,
					end_date,
					type as EntryType | undefined,
				);
				return json({ count: entries.length, entries });
			},
		);

		this.server.registerTool(
			"edit_entry",
			{
				description:
					"Correct an existing nutrition entry, addressed by its `key` (the " +
					"YYYY-MM-DD-HHMMSS stem). Only items, meal, and confidence can change; " +
					"totals are recomputed from items. The original input_text and the date " +
					"are immutable.",
				inputSchema: {
					key: z.string().describe("The entry key / stem, e.g. 2026-06-24-214626"),
					...editNutritionInput,
				},
			},
			async ({ key, ...patch }) => {
				const objectKey = keyFromStem(NUTRITION, key);
				const existing = await getEntry(this.bucket, objectKey);
				if (!existing) {
					throw new Error(`Entry not found: ${key}`);
				}
				const updated = applyNutritionEdit(existing, patch);
				await putEntry(this.bucket, objectKey, updated);
				return json({ key: objectKey, entry: updated });
			},
		);

		this.server.registerTool(
			"delete_entry",
			{
				description:
					"Delete a nutrition entry by its `key` (the YYYY-MM-DD-HHMMSS stem). " +
					"Errors if no such entry exists.",
				inputSchema: {
					key: z.string().describe("The entry key / stem, e.g. 2026-06-24-214626"),
				},
			},
			async ({ key }) => {
				const objectKey = keyFromStem(NUTRITION, key);
				const existing = await getEntry(this.bucket, objectKey);
				if (!existing) {
					throw new Error(`Entry not found: ${key}`);
				}
				await deleteEntry(this.bucket, objectKey);
				return json({ deleted: objectKey });
			},
		);

		this.server.registerTool(
			"get_daily_totals",
			{
				description:
					"Per-day macro rollups for [start_date, end_date] inclusive — calories, " +
					"protein, carbs, fat, and entry count per logical date. For trend questions.",
				inputSchema: {
					start_date: dateArg,
					end_date: dateArg,
				},
			},
			async ({ start_date, end_date }) => {
				const entries = await listEntries(this.bucket, start_date, end_date, NUTRITION);
				return json({ days: dailyTotals(entries) });
			},
		);
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp") as never,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GitHubHandler as never,
	tokenEndpoint: "/token",
});
