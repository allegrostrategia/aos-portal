import { monthLabel } from "./months.ts";

/**
 * What publishing out of order does, said before it is done.
 *
 * Dom, 7 October. The snapshot is computed when a month is published, so
 * publishing September while August is still a draft freezes **August's
 * unfinished figures** into September — permanently, since the whole point
 * of the snapshot is that it does not change afterwards. Finishing August
 * later would not fix September; only republishing September would.
 *
 * A warning, not a refusal. A month nobody will ever publish is a real
 * case — a client who joined mid-month, a period opened by mistake — and
 * she may simply have a reason. The screen makes her say so rather than
 * deciding for her.
 */

function listOf(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The sentence, or null when every earlier month with figures is published.
 *
 * `draftsBefore` is every month before this one that holds figures and has
 * not gone out. A month with nothing in it is absent rather than
 * unfinished, and warning about one would put this on every first publish.
 */
export function publishWarning(draftsBefore: string[], month: string): string | null {
  if (draftsBefore.length === 0) return null;

  const labels = [...draftsBefore].sort().map(monthLabel);
  const one = labels.length === 1;

  // Dom's wording, 7 October. The plural changes only what grammar forces.
  return (
    `${listOf(labels)} ${one ? "is still a draft" : "are still drafts"}. ` +
    `Publish ${one ? "it" : "them"} first, or ${monthLabel(month)} will be ` +
    `compared against unfinished figures.`
  );
}
