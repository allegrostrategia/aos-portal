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
  /**
   * One of the client's own sources (19 November).
   *
   * **An id OR a slot number**, which is the one thing in this shape
   * that is not a plain key. A source and its two figures are typed on
   * the same screen and saved by the same button, so a brand-new source
   * has no id at the moment its boxes are named. The box carries
   * `s<slot>` instead, and the save resolves the slot to the row it
   * has just written — see `saveLaunchFigures`. A source that already
   * exists uses its id, so an existing figure's box name never changes.
   */
  sourceId?: string | null;
  day?: number | null;
  email?: number | null;
}

export function launchFieldName(metricKey: string, at: LaunchAt = {}): string {
  return [
    "launch",
    metricKey,
    at.stageId ?? "-",
    at.priceId ?? "-",
    at.sourceId ?? "-",
    at.day ?? "-",
    at.email ?? "-",
  ].join(":");
}

/** The slot form of a source box, for a row that does not exist yet. */
export function sourceSlot(slot: number): string {
  return `s${slot}`;
}

/** One of the words typed about an email, rather than one of its figures. */
export function emailFieldName(
  stageId: string,
  number: number,
  field: "sent_on" | "subject" | "is_resend",
): string {
  return `email:${stageId}:${number}:${field}`;
}

/** One of the words typed about a source. */
export function sourceFieldName(slot: number, field: "id" | "name" | "target"): string {
  return `source:${slot}:${field}`;
}

/**
 * A launch's figures as a plain object, for crossing into a Client
 * Component — a `Map` inside a class cannot, which is how React found
 * this. Keyed by `launchFieldName`.
 */
export type LaunchFigures = Record<string, number | null>;
