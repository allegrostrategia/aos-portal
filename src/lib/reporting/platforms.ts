import type { ReportEntity } from "./queries.ts";

/**
 * The client's social platforms (§5.2: "Instagram first; TikTok and
 * LinkedIn added later using the same structure").
 *
 * **Until 11 November there was only ever one.** Every reader did
 * `entities.find(e => e.entity_type === "social_platform")` — the first
 * by sort order — so a second row's figures were storable and
 * unreadable, which is what `e2e/platforms.spec.ts` photographed. This
 * file is the one place that answers "which platform", so there is no
 * second place to get it wrong.
 *
 * **The first one is the main one**, and that is a rule rather than an
 * accident: the Overview shows one Followers figure and it has to be
 * somebody's. Never a sum — adding followers across platforms counts the
 * same person twice, which is the mistake §10.1 already refuses for
 * reach (Nina via Dom, 11 November).
 */

export type PlatformRow = Pick<ReportEntity, "id" | "name" | "active" | "sort_order">;

type MaybePlatform = Pick<ReportEntity, "id" | "name" | "active" | "sort_order" | "entity_type">;

/**
 * Sorted by `sort_order`, then by name so the order never depends on
 * which row the database happened to return first. New platforms are
 * given the next sort order when they are created, so this is creation
 * order — and Instagram, created by the first ever save, stays first.
 */
export function platformsOf(entities: MaybePlatform[], { includeRetired = false } = {}): PlatformRow[] {
  return entities
    .filter((e) => e.entity_type === "social_platform" && (includeRetired || e.active))
    .map(({ id, name, active, sort_order }) => ({ id, name, active, sort_order }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

/**
 * The platform a screen should show, given what the URL asked for.
 *
 * An id that is not one of theirs falls back to the main one rather than
 * erroring — the same rule `resolveWorkspace` follows, and for the same
 * reason: a URL somebody has edited should land somewhere real.
 *
 * **A retired platform is still shown if it is asked for by id**, so a
 * past month of a platform they have stopped using can still be read.
 */
export function choosePlatform(
  entities: MaybePlatform[],
  requested?: string | null,
): PlatformRow | null {
  const live = platformsOf(entities);
  if (requested) {
    const all = platformsOf(entities, { includeRetired: true });
    const match = all.find((p) => p.id === requested);
    if (match) return match;
  }
  return live[0] ?? platformsOf(entities, { includeRetired: true })[0] ?? null;
}

/** The main platform: whose figure the Overview shows, and whose name it says. */
export function mainPlatform(entities: MaybePlatform[]): PlatformRow | null {
  return platformsOf(entities)[0] ?? null;
}

/**
 * Does this platform take a Meta content export?
 *
 * Used for one sentence on the upload card, never to decide where the
 * figures go — the file fills whichever platform is on screen, because
 * that is the one the person chose. Matching on the name is only ever
 * advice, so a client who renames Instagram to "IG" gets a slightly less
 * helpful card rather than their figures in the wrong place.
 */
export function looksLikeMeta(name: string): boolean {
  return /instagram|facebook|\big\b|meta/i.test(name);
}
