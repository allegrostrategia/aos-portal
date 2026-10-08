/**
 * The name of one box on a launch's entry screen.
 *
 * `launch:<metric>:<stage|->:<price|->:<day|->:<email|->`, covering all
 * four of the contexts a launch figure can hang off: a stage (sign-ups),
 * a stage and a day (live attendees on day 3), a stage and an email (the
 * open rate of email 2), a price option (sales at £500), or nothing at
 * all (cash collected).
 *
 * **Its own module, with no server imports**, because the Client
 * Component that names the boxes and the server code that parses them
 * both need it — and `launch-queries.ts` is `server-only`, so it cannot
 * be the home for a string shared across that boundary.
 *
 * One builder so a box's name and its lookup key cannot drift apart. The
 * first cut had two shapes for the same thing — `-` in the name and `""`
 * in the key — and a mismatch would have shown as nothing worse than a
 * box that came back empty.
 */

/** Where a launch figure hangs. */
export interface LaunchAt {
  stageId?: string | null;
  priceId?: string | null;
  day?: number | null;
  email?: number | null;
}

export function launchFieldName(metricKey: string, at: LaunchAt = {}): string {
  return [
    "launch",
    metricKey,
    at.stageId ?? "-",
    at.priceId ?? "-",
    at.day ?? "-",
    at.email ?? "-",
  ].join(":");
}

/**
 * A launch's figures as a plain object, for crossing into a Client
 * Component — a `Map` inside a class cannot, which is how React found
 * this. Keyed by `launchFieldName`.
 */
export type LaunchFigures = Record<string, number | null>;
