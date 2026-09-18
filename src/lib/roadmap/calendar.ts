import {
  addDays,
  firstMondayOfMonth,
  firstMondayOfNextMonth,
  mondayOf,
  type IsoDate,
} from "../onboarding/cadence.ts";

/**
 * La Strada's calendar: six months of weeks, from a start date.
 *
 * A roadmap month is a calendar month, and its weeks are the weeks that
 * begin on a Monday inside it, counted from the first Monday, exactly as the
 * onboarding cadence counts them. That is what the roadmap's `week` field
 * has meant since 3 Sep ("week 2 of the month"), so a plan already written
 * against it lands in the right cards. It also means a month holds four or
 * five weeks, not always four: the six months run to 26 or 27 weeks in
 * total, not 24. The hero says "Week X of N" with the real N.
 *
 * `startsOn` is the first Monday of month 1. Anything else passed in is
 * snapped to it, so the anchor can't drift into the middle of a month.
 *
 * Pure, and takes "today", so the tests can stand anywhere in the plan.
 */

export const ROADMAP_MONTHS = 6;

export type RoadmapWeek = {
  /** 1-based across the whole plan. */
  index: number;
  /** 1-based within its month: the roadmap's `week` field. */
  weekOfMonth: number;
  month: number;
  /** Monday and Sunday, YYYY-MM-DD. */
  from: IsoDate;
  to: IsoDate;
};

export type RoadmapCalendar = {
  startsOn: IsoDate;
  months: { month: number; from: IsoDate; weeks: RoadmapWeek[] }[];
  weeks: RoadmapWeek[];
  totalWeeks: number;
};

/** The first Monday of the calendar month containing `date`, as a plan start. */
export function snapStart(date: IsoDate): IsoDate {
  return firstMondayOfMonth(date);
}

export function buildCalendar(startsOn: IsoDate): RoadmapCalendar {
  const start = snapStart(startsOn);
  const months: RoadmapCalendar["months"] = [];
  const weeks: RoadmapWeek[] = [];

  let monthStart = start;
  for (let m = 1; m <= ROADMAP_MONTHS; m++) {
    const next = firstMondayOfNextMonth(monthStart);
    const monthWeeks: RoadmapWeek[] = [];
    for (let from = monthStart; from < next; from = addDays(from, 7)) {
      const week: RoadmapWeek = {
        index: weeks.length + 1,
        weekOfMonth: monthWeeks.length + 1,
        month: m,
        from,
        to: addDays(from, 6),
      };
      monthWeeks.push(week);
      weeks.push(week);
    }
    months.push({ month: m, from: monthStart, weeks: monthWeeks });
    monthStart = next;
  }

  return { startsOn: start, months, weeks, totalWeeks: weeks.length };
}

export type PlanPosition =
  | { kind: "before"; startsOn: IsoDate }
  | { kind: "during"; week: RoadmapWeek }
  | { kind: "after"; totalWeeks: number };

/** Where `today` falls in the plan. */
export function positionOn(calendar: RoadmapCalendar, today: IsoDate): PlanPosition {
  const monday = mondayOf(today);
  if (monday < calendar.startsOn) return { kind: "before", startsOn: calendar.startsOn };
  const week = calendar.weeks.find((w) => w.from === monday);
  if (week) return { kind: "during", week };
  return { kind: "after", totalWeeks: calendar.totalWeeks };
}

/** "Week 6 of 26", "Starts 5 October", "All 26 weeks". */
export function weekLabel(position: PlanPosition, total: number): string {
  if (position.kind === "before") return `Starts ${longDate(position.startsOn)}`;
  if (position.kind === "after") return `All ${total} weeks`;
  return `Week ${position.week.index} of ${total}`;
}

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_MONTH_LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

function longDate(date: IsoDate): string {
  return DAY_MONTH_LONG.format(new Date(`${date}T00:00:00Z`));
}

/** "7 – 13 Sept" within a month; "28 Sept – 4 Oct" across one. */
export function weekRange(week: RoadmapWeek): string {
  const from = new Date(`${week.from}T00:00:00Z`);
  const to = new Date(`${week.to}T00:00:00Z`);
  const sameMonth = from.getUTCMonth() === to.getUTCMonth();
  const month = (d: Date) => DAY_MONTH.format(d).replace(/^\d+ /, "");
  return sameMonth
    ? `${from.getUTCDate()} – ${to.getUTCDate()} ${month(to)}`
    : `${DAY_MONTH.format(from)} – ${DAY_MONTH.format(to)}`;
}

/** The month name for a plan month: "October 2026". */
export function monthName(from: IsoDate): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${from}T00:00:00Z`));
}
