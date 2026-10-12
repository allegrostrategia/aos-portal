import { lastDayOf } from "../months.ts";
import { parseExportDate } from "./dates.ts";

/**
 * Whether an export covers the whole month it is being uploaded into.
 *
 * §10.2's ads export carries its own date range (`Reporting starts`,
 * `Reporting ends`), and the person choosing the file is not the same
 * act as the person choosing the month — the two drift apart the first
 * time somebody uploads last month's file into this month.
 *
 * **A partial month is refused too** (Dom, 9 October), and that is the
 * part worth being explicit about: the brief's own sample runs 1 to 28
 * September, which this refuses for September. That is deliberate. A
 * month's spend filled from twenty-eight days of it is wrong by two
 * days and says nothing about being wrong — and every figure derived
 * from it, cost per lead included, is wrong by the same invisible
 * amount. Re-exporting with the right range is a minute's work; finding
 * this afterwards is not.
 */
export function coversMonth(
  start: string | null,
  end: string | null,
  month: string,
): { ok: true } | { ok: false; reason: string } {
  const monthEnd = lastDayOf(month);

  if (!start || !end) {
    // No range in the file is not a refusal: the content export has no
    // such columns and filters by publish date instead.
    return { ok: true };
  }

  if (start <= month && end >= monthEnd) return { ok: true };

  return {
    ok: false,
    reason: `That file covers ${start} to ${end}, and this report is for ${month} to ${monthEnd}. Export it again for the whole month.`,
  };
}

/** The range an ads export says it covers, if it says. */
export function rangeFromRows(
  rows: Record<string, string>[],
): { start: string | null; end: string | null } {
  const first = rows[0] ?? {};
  return {
    start: parseExportDate(first["reporting starts"], "iso"),
    end: parseExportDate(first["reporting ends"], "iso"),
  };
}
