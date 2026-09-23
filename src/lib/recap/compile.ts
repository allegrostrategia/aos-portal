// Relative rather than the usual `@/` alias: this module is covered by unit
// tests, and Node's test runner resolves imports itself without the bundler's
// path mapping (the same note as log/priming.ts).
import { formatCalendarMonth, formatCalendarDate } from "../time-zone.ts";
import { formatHours } from "../hours/milestones.ts";

/**
 * The compiler: a month of a member's real data as one block of text, for
 * Nina to paste into a Claude conversation outside the product (brief §1).
 *
 * Pure on purpose. Everything here is formatting decisions about a member's
 * own month — which is exactly the kind of thing that goes subtly wrong and
 * nobody notices, because the output looks plausible either way. A pure
 * function can be tested against a fixture; a query that also formats cannot.
 *
 * Three rules it follows throughout:
 *
 *   · **Zeroes are stated, never omitted.** "Roadmap actions completed: none"
 *     is information; a missing section reads as an oversight and invites a
 *     draft that claims something that didn't happen.
 *   · **Nothing is interpreted.** No "a great month" — the numbers and the
 *     member's own words, and the judgement is Nina's.
 *   · **The private reflections are labelled as private**, every time, so the
 *     label travels with the text into whatever document it is pasted into.
 */

export type RecapSource = {
  memberName: string;
  /** First of the month. */
  month: string;
  /** Minutes tracked in the month, from entries that finished. */
  loggedMinutes: number;
  byCategory: { label: string; minutes: number }[];
  /** Weeks whose log was signed off inside the month. */
  weeksSignedOff: number;
  hoursReclaimedThisMonth: number;
  hoursReclaimedTotal: number;
  milestonesCrossed: { target: number; weekStart: string }[];
  actionsDone: { label: string; monthTitle: string | null }[];
  /** Builds confirmed in the month, with what each is worth a week. */
  builds: { title: string; hoursPerWeek: number | null }[];
  /** The challenge confirmed for that month's hot seat, in Nina's words. */
  hotSeatChallenge: string | null;
  /** "Anything else this week" — private to the member and Nina (rule 6). */
  reflections: { weekStart: string; body: string }[];
};

function hoursAndMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function section(title: string, lines: string[]): string {
  return [title, ...lines.map((line) => `  ${line}`)].join("\n");
}

export function compileRecapSource(source: RecapSource): string {
  const monthName = formatCalendarMonth(source.month);

  const blocks: string[] = [
    [
      `MONTHLY RECAP — SOURCE DATA`,
      `${source.memberName} · ${monthName}`,
      ``,
      `Assembled by aOS from this member's own tracked data. Every number below`,
      `is theirs and is already visible to them inside the portal.`,
    ].join("\n"),

    section("TIME TRACKED", [
      `${hoursAndMinutes(source.loggedMinutes)} logged`,
      `${source.weeksSignedOff} ${source.weeksSignedOff === 1 ? "week" : "weeks"} signed off this month`,
      ...(source.byCategory.length > 0
        ? source.byCategory.map((row) => `${row.label}: ${hoursAndMinutes(row.minutes)}`)
        : ["No categories tracked this month."]),
    ]),

    section("HOURS RECLAIMED", [
      `${formatHours(source.hoursReclaimedThisMonth)} hrs banked this month`,
      `${formatHours(source.hoursReclaimedTotal)} hrs since they joined`,
    ]),

    section(
      "MILESTONES CROSSED",
      source.milestonesCrossed.length > 0
        ? source.milestonesCrossed.map(
            (milestone) =>
              `Passed ${milestone.target} hours in the week of ${formatCalendarDate(milestone.weekStart)}`,
          )
        : ["None this month."],
    ),

    section(
      `ROADMAP ACTIONS COMPLETED (${source.actionsDone.length})`,
      source.actionsDone.length > 0
        ? source.actionsDone.map(
            (action) => `${action.label}${action.monthTitle ? ` (${action.monthTitle})` : ""}`,
          )
        : ["None ticked off this month."],
    ),

    section("THIS MONTH'S BUILD", [
      ...(source.builds.length > 0
        ? source.builds.map(
            (build) =>
              `${build.title}${
                build.hoursPerWeek === null
                  ? " (no weekly rate set)"
                  : ` — worth ${formatHours(build.hoursPerWeek)} hrs a week`
              }`,
          )
        : ["No build confirmed this month."]),
      ...(source.hotSeatChallenge
        ? ["", `Hot seat challenge, as confirmed:`, `"${source.hotSeatChallenge}"`]
        : []),
    ]),

    section("THEIR OWN WORDS — PRIVATE FRIDAY REFLECTIONS", [
      `Written into "Anything else this week" on their weekly log, for Nina`,
      `alone. Source material for this member's own recap and nothing else:`,
      `never quoted to anyone, never posted into a shared room.`,
      ``,
      ...(source.reflections.length > 0
        ? source.reflections.flatMap((reflection) => [
            `Week of ${formatCalendarDate(reflection.weekStart)}:`,
            `"${reflection.body.trim()}"`,
            ``,
          ])
        : ["Nothing written this month."]),
    ]),
  ];

  return `${blocks.join("\n\n")}\n`;
}
