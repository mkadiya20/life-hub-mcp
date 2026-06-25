import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { createNutritionEntry, type EntryType } from "./entry";
import { logMealInput, toNutritionBody } from "./nutrition";
import { listEntries, putEntry } from "./store";

const entryTypeSchema = z.enum(["nutrition-entry"]);
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Life Hub",
		version: "0.1.0",
	});

	private get bucket(): R2Bucket {
		return (this.env as Env).BUCKET;
	}

	async init() {
		this.server.registerTool(
			"log_meal",
			{
				description:
					"Log a meal as one immutable nutrition entry. Provide per-item macros " +
					"(you estimate them); totals are derived. Omit `date` to log for now " +
					"(6am-Toronto logical date); pass an explicit date for backfilling.",
				inputSchema: logMealInput,
			},
			async (input) => {
				const body = toNutritionBody(input);
				const { entry, key } = createNutritionEntry(body, input.date);
				await putEntry(this.bucket, key, entry);
				return {
					content: [{ type: "text", text: JSON.stringify({ key, entry }, null, 2) }],
				};
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
				return {
					content: [
						{ type: "text", text: JSON.stringify({ count: entries.length, entries }, null, 2) },
					],
				};
			},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
