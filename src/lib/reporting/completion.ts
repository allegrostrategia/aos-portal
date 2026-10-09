/**
 * "Still to fill in" (§8.1): how much of a category's core is answered.
 *
 * **Its own module, with no imports that are not types.** It used to sit
 * in `month-figures.ts`, which reaches the database through `@/lib`
 * aliases — so it could not be unit-tested without a Supabase client,
 * and it had no tests at all. Three sections that could never be
 * finished is what that cost. Everything it needs is in the structural
 * type below, so the test can hand it four fields and no database.
 */

/** Exactly what completion reads from a month, and nothing else. */
export interface CompletionInput {
  metrics: {
    key: string;
    category: string;
    input_type: string;
    entity_type: string | null;
  }[];
  /** A month-level figure, already resolving the single social platform. */
  figure: (key: string) => number | null;
  /** §5.8's opening figure: non-null once it has been answered, in any month. */
  openingClients: { inUse: unknown };
  data: {
    entities: { id: string; entity_type: string; active: boolean }[];
    values: { get: (key: string, entityId: string) => number | null };
  };
}

/**
 * How much of a category's core is filled in, for "Still to fill in" (§8.1).
 *
 * "Core" is `report_metrics.input_type`, which the brief seeds from its
 * own §5 — the same distinction §8.1 means by "core fields". There is no
 * second marker beside it, deliberately: two would eventually disagree.
 *
 * Not simply `figure(key) !== null`, for three reasons, each of which
 * was a section that could never finish:
 *
 *   · **Figures that hang off rows.** Offers, Funnels and Ads store
 *     against each offer, funnel and campaign, so a month-level lookup
 *     finds nothing and the category reads 0/3 however much is in it.
 *     A core metric counts as filled when EVERY active row has it —
 *     three offers with two priced is not a finished section. (Until
 *     2 October this was wrong for every client; until 9 October it was
 *     fixed for Offers only, and Funnels and Ads still read zero.)
 *
 *   · **A row-backed section with no rows owes nothing.** A member with
 *     no funnels was shown 0 of 3 for ever — permanently unfinished for
 *     a section that was never going to have anything in it. Nothing set
 *     up means nothing to fill in, which is `total: 0` and done.
 *
 *   · **The figure that is only ever asked once.** "Clients at the
 *     start, when you joined" is entered one time and carried forward —
 *     `computeCarried` reads it across every month up to this one. Asked
 *     monthly it would hold Client Experience open for ever, which is
 *     the one thing a completion marker must never do.
 */

/**
 * The core figure that is asked once rather than every month.
 *
 * Named here rather than flagged in the database because it is the only
 * one: §5.8's opening figure exists so the client-flow sum has somewhere
 * to start, and a second of its kind would be a different design, not
 * another row.
 */
const ASKED_ONCE = "client_experience_clients_at_start_opening";

/**
 * Categories whose figures are stored per row the member sets up.
 *
 * `social_platform` is deliberately absent: its metrics carry an entity
 * type too, but there is exactly one platform row and `figure()` already
 * resolves through it, so treating it as row-backed would ask the same
 * question twice and get a worse answer.
 */
const ROW_BACKED = new Set(["offer", "funnel", "ad_campaign"]);

export function categoryCompletion(
  figures: CompletionInput,
  category: string,
): { filled: number; total: number } {
  const core = figures.metrics.filter(
    (m) => m.category === category && m.input_type === "core",
  );
  if (core.length === 0) return { filled: 0, total: 0 };

  const entityType = core[0].entity_type;
  const rows =
    entityType && ROW_BACKED.has(entityType)
      ? figures.data.entities.filter((e) => e.entity_type === entityType && e.active)
      : null;

  // Nothing set up is nothing owed — not a section that can never finish.
  if (rows && rows.length === 0) return { filled: 0, total: 0 };

  const isFilled = (metric: (typeof core)[number]) => {
    // Asked once, so it counts from whichever month it was answered in.
    if (metric.key === ASKED_ONCE) return figures.openingClients.inUse !== null;
    if (rows) return rows.every((row) => figures.data.values.get(metric.key, row.id) !== null);
    return figures.figure(metric.key) !== null;
  };

  return { filled: core.filter(isFilled).length, total: core.length };
}
