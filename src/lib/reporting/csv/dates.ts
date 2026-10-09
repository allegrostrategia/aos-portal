/**
 * A date out of a Meta export, read in the format that file uses.
 *
 * **The two exports disagree, and that is the whole reason this exists
 * as its own module with its own tests.** The content export writes US
 * dates (MM/DD/YYYY); the ads export writes ISO (YYYY-MM-DD). §10 says
 * so explicitly for each.
 *
 * Nothing is guessed from the value. `03/04/2026` is the 4th of March
 * in one reading and the 3rd of April in the other, both are valid
 * dates, and a parser that picks by looking would be right most of the
 * time and silently wrong for the twelve days a year it matters —
 * which is exactly the kind of wrong that reaches a client's report.
 *
 * Null for anything unparseable, so a row with a bad date is counted
 * as outside the month rather than dropped into it.
 */

export type DateFormat = "us" | "iso";

export function parseExportDate(raw: string | undefined, format: DateFormat): string | null {
  if (!raw) return null;
  // Meta appends a time to the content export's publish column.
  const text = raw.trim().split(/[ T]/)[0];

  const match =
    format === "us"
      ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
      : /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!match) return null;

  const [year, month, day] =
    format === "us"
      ? [Number(match[3]), Number(match[1]), Number(match[2])]
      : [Number(match[1]), Number(match[2]), Number(match[3])];

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A real date, not just a well-shaped one: 31 February is neither.
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (asDate.getUTCMonth() !== month - 1 || asDate.getUTCDate() !== day) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Whether a parsed date falls in the report month. */
export function inMonth(date: string | null, month: string): boolean {
  return date !== null && date.slice(0, 7) === month.slice(0, 7);
}
