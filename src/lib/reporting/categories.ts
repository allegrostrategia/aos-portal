/**
 * The categories, defined once.
 *
 * The tab row, the entry pages, the report pages and the completion count all
 * need the same list in the same order, and §13 asks for shared helpers
 * defined once rather than each screen keeping its own copy. This is that
 * copy.
 *
 * Two spellings of every category exist and they are not interchangeable:
 * `key` is the database enum (`leads_conversions`), `slug` is what goes in a
 * URL (`leads-conversions`). Converting between them by hand is how one screen
 * ends up linking to a 404, so it happens here.
 */

/** Matches the `report_category` enum exactly. */
export type CategoryKey =
  | "overview"
  | "social_media"
  | "trial_reels"
  | "email"
  | "funnels"
  | "leads_conversions"
  | "ads"
  | "client_experience"
  | "offers"
  | "financials"
  | "launches";

export interface Category {
  key: CategoryKey;
  slug: string;
  label: string;
  /** Which build stage brings it in (§11). Only shipped ones get a tab. */
  stage: 2 | 3 | 4;
  /**
   * Whether figures are typed into it. Overview is a report only (§5.1: "no
   * inputs"), and Launches has its own screens rather than a monthly form.
   */
  entry: boolean;
  /** One line under the heading on its own page. */
  tagline: string;
}

/**
 * Order follows the approved mockups' tab row left to right, which is also
 * the order of §5.
 */
export const CATEGORIES: Category[] = [
  {
    key: "overview",
    slug: "overview",
    label: "Overview",
    stage: 2,
    entry: false,
    tagline: "THE MONTH AT A GLANCE",
  },
  {
    key: "social_media",
    slug: "social-media",
    label: "Social Media",
    stage: 2,
    entry: true,
    tagline: "AUDIENCE, CONTENT, ENGAGEMENT",
  },
  {
    key: "trial_reels",
    slug: "trial-reels",
    label: "Trial Reels",
    stage: 3,
    entry: true,
    tagline: "WHAT THE TRIALS DID",
  },
  {
    key: "email",
    slug: "email",
    label: "Email",
    stage: 2,
    entry: true,
    tagline: "LIST, SENDS, REVENUE",
  },
  {
    key: "funnels",
    slug: "funnels",
    label: "Funnels",
    stage: 3,
    entry: true,
    tagline: "FROM VIEW TO PURCHASE",
  },
  {
    key: "leads_conversions",
    slug: "leads-conversions",
    label: "Leads & Conversions",
    stage: 2,
    entry: true,
    tagline: "WHERE CLIENTS COME FROM",
  },
  {
    key: "ads",
    slug: "ads",
    label: "Ads",
    stage: 3,
    entry: true,
    tagline: "SPEND AND WHAT IT BOUGHT",
  },
  {
    key: "client_experience",
    slug: "client-experience",
    label: "Client Experience",
    stage: 3,
    entry: true,
    tagline: "RETENTION AND RENEWALS",
  },
  {
    key: "offers",
    slug: "offers",
    label: "Offers",
    stage: 2,
    entry: true,
    tagline: "WHAT EACH OFFER EARNS",
  },
  {
    key: "financials",
    slug: "financials",
    label: "Financials",
    stage: 2,
    entry: true,
    tagline: "REVENUE, COSTS, PROFIT",
  },
  {
    key: "launches",
    slug: "launches",
    label: "Launches",
    stage: 4,
    entry: false,
    tagline: "EVERY LAUNCH, END TO END",
  },
];

/** What production ships. Raised deliberately, by hand, in one place. */
const PRODUCTION_STAGE = 2;

/**
 * The stage this build has shipped.
 *
 * A tab is drawn only for a category that has a page behind it — §13: "Every
 * clickable card, tab or button has exactly one route in." Raising
 * `PRODUCTION_STAGE` is what turns the remaining tabs on, when their pages
 * land and Nina has seen them.
 *
 * **A development server can look ahead, and nothing else can.** Stage 3's
 * tabs have no route until that number moves, so there is no way to check a
 * finished one on localhost without either shipping it to every client or
 * this. `NEXT_PUBLIC_REPORTING_STAGE=3 npm run dev` shows them; the guard
 * below is `NODE_ENV`, which `next build` sets to production and no
 * environment variable can talk it out of. Setting the variable in Vercel
 * does nothing at all, which is the point — an unfinished tab in front of a
 * real client is exactly the failure this is meant to avoid.
 */
export const SHIPPED_STAGE: 2 | 3 | 4 =
  process.env.NODE_ENV === "development"
    ? (Number(process.env.NEXT_PUBLIC_REPORTING_STAGE) as 2 | 3 | 4) || PRODUCTION_STAGE
    : PRODUCTION_STAGE;

/**
 * Whether Stage 3's additions to screens that already shipped are on.
 *
 * The four new tabs are hidden by having no route. The Overview is a
 * Stage 2 screen that a client opens today, so its Stage 3 additions —
 * the two panels, the traffic lights, the target bar — need their own
 * switch, and it is this one. Pushing Stage 3 then changes nothing a
 * client sees until `PRODUCTION_STAGE` moves, which is the same
 * promise the tabs make (Dom, 6 October).
 */
export const STAGE_3 = SHIPPED_STAGE >= 3;

export const SHIPPED_CATEGORIES = CATEGORIES.filter((c) => c.stage <= SHIPPED_STAGE);

/** The categories a month's figures are typed into, in tab order. */
export const ENTRY_CATEGORIES = SHIPPED_CATEGORIES.filter((c) => c.entry);

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryByKey(key: string): Category | null {
  return BY_KEY.get(key as CategoryKey) ?? null;
}

/** Null for an unknown slug, or one whose page has not shipped yet. */
export function categoryBySlug(slug: string): Category | null {
  const found = BY_SLUG.get(slug);
  return found && found.stage <= SHIPPED_STAGE ? found : null;
}
