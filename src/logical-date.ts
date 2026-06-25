/**
 * Logical-date rule. America/Toronto, day runs 6am→6am, so a meal
 * logged before 6am belongs to the previous date.
 *
 * Conversion goes through the IANA timezone (DST-aware), never a fixed offset: Toronto's
 * DST switch is at 2am, inside the midnight–6am window, so offset math misfiles twice a year.
 */

export const TIMEZONE = "America/Toronto";
const DAY_START_HOUR = 6;

interface WallClock {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

function toTorontoWallClock(instant: Date): WallClock {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(instant);

	const get = (type: Intl.DateTimeFormatPartTypes): number => {
		const value = parts.find((p) => p.type === type)?.value;
		if (value === undefined) {
			throw new Error(`Missing "${type}" when formatting instant for ${TIMEZONE}`);
		}
		return Number(value);
	};

	const rawHour = get("hour"); // Intl can emit "24" at midnight under hour12:false
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		hour: rawHour === 24 ? 0 : rawHour,
		minute: get("minute"),
		second: get("second"),
	};
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

function formatCalendarDate(year: number, month: number, day: number): string {
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

// UTC math is used only for calendar rollover (month/year/leap-year); no timezone involved.
function previousCalendarDate(year: number, month: number, day: number): string {
	const d = new Date(Date.UTC(year, month - 1, day));
	d.setUTCDate(d.getUTCDate() - 1);
	return formatCalendarDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Logical date (YYYY-MM-DD) for an instant, applying the 6am rule. Defaults to now. */
export function logicalDate(instant: Date = new Date()): string {
	const wall = toTorontoWallClock(instant);
	if (wall.hour < DAY_START_HOUR) {
		return previousCalendarDate(wall.year, wall.month, wall.day);
	}
	return formatCalendarDate(wall.year, wall.month, wall.day);
}

/**
 * HHMMSS in Toronto wall-clock time — the real logging time, NOT shifted by the 6am rule.
 * A 12:30am log keeps "003000" even though its logical date is the previous day.
 */
export function logicalTimeStamp(instant: Date = new Date()): string {
	const wall = toTorontoWallClock(instant);
	return `${pad2(wall.hour)}${pad2(wall.minute)}${pad2(wall.second)}`;
}

/** Filename stem / idempotency key for an instant: `{logical_date}-{HHMMSS}`. */
export function entryStamp(instant: Date = new Date()): { date: string; stem: string } {
	const date = logicalDate(instant);
	return { date, stem: `${date}-${logicalTimeStamp(instant)}` };
}
