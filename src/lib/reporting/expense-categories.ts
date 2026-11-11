import type { ExpenseBucket } from "./ledger.ts";

/**
 * The expense categories a workspace starts with (Nina, 11 November).
 *
 * Taken from her own 2025 tracker, which runs about twenty of them, and
 * **written down as examples rather than as a rule**: the screen says
 * "here are some examples" and a client can rename any of them, retire
 * the ones that are not theirs, and add their own. What they cannot
 * change is the bucket each one feeds, because Total costs, Profit and
 * the margin are built on the four buckets and have been since §5.10.
 *
 * The mapping below is mine and should be read as a first draft for
 * Nina. Three of them are judgement calls worth her eye:
 *
 *   · **Director pay** sits in Team rather than Fixed. It is what the
 *     business pays a person, which is what Team means on this report.
 *   · **Coaching or mentoring** and **Funding** sit in Investment, which
 *     §5.10 describes as "courses, coaching, events" — so coaching is
 *     the example the brief itself gives.
 *   · **Personal** sits in Variable. It is drawings in her sheet, and
 *     none of the four buckets is really for that; Variable is the one
 *     that distorts the margin least.
 *
 * `IQA` keeps her own note's answer — her sheet says "put into staff" —
 * so it maps to Team rather than being guessed at.
 */

export interface DefaultExpenseCategory {
  name: string;
  bucket: ExpenseBucket;
}

export const DEFAULT_EXPENSE_CATEGORIES: DefaultExpenseCategory[] = [
  { name: "Insurance", bucket: "fixed" },
  { name: "Subscriptions", bucket: "fixed" },
  { name: "Accounts", bucket: "fixed" },
  { name: "Phone and tech", bucket: "fixed" },
  { name: "Software", bucket: "fixed" },
  { name: "Zoom", bucket: "fixed" },
  { name: "Governing body", bucket: "fixed" },
  { name: "Rent", bucket: "fixed" },

  { name: "Ads", bucket: "variable" },
  { name: "Advertising and marketing", bucket: "variable" },
  { name: "Affiliates", bucket: "variable" },
  { name: "Entertaining", bucket: "variable" },
  { name: "Travel and accommodation", bucket: "variable" },
  { name: "Charity", bucket: "variable" },
  { name: "Personal", bucket: "variable" },
  { name: "Other", bucket: "variable" },

  { name: "Staff", bucket: "team" },
  { name: "Director pay", bucket: "team" },
  { name: "IQA", bucket: "team" },

  { name: "Coaching or mentoring", bucket: "investment" },
  { name: "Funding", bucket: "investment" },
];

/** What each bucket is called on screen, and what it already means (§5.10). */
export const BUCKET_LABEL: Record<ExpenseBucket, string> = {
  fixed: "Fixed costs",
  variable: "Variable costs",
  team: "Team costs",
  investment: "Investment spend",
};

export const BUCKET_HINT: Record<ExpenseBucket, string> = {
  fixed: "Subscriptions, rent, software",
  variable: "Ads, contractors, fees",
  team: "Salaries, VAs, freelancers",
  investment: "Courses, coaching, events",
};
