import type { OpeningFigure } from "./client-flow.ts";

/**
 * Which month asks for §5.8's opening figure, and what the screen says.
 *
 * Pure, and separate from the component, because this is the part that can
 * be wrong in a way nobody notices: the wording tells Nina which figure is
 * doing the work, and a screen that prompts her in the wrong month, or
 * quietly ignores a figure she typed, is worse than no card at all.
 *
 * **The field belongs in exactly one month**: the month holding the opening
 * figure in use, or — when there is none yet — the workspace's first month.
 * Plus any month holding a stray, so a stray can be cleared from where it
 * sits rather than only in the database.
 *
 * The rule for which figure wins is `openingFigures()`: earliest stored.
 * This decides what to *say* about it.
 */

export type OpeningNote =
  /** No figure anywhere, and this is the month to type it in. */
  | { kind: "ask"; field: true }
  /** No figure anywhere, and it belongs on an earlier month. */
  | { kind: "ask_elsewhere"; field: false; belongsOn: string }
  /** This month holds the figure in use. */
  | { kind: "in_use"; field: true; value: number; stray: null }
  /** The figure in use is elsewhere; this month may still hold a stray. */
  | {
      kind: "carried";
      field: boolean;
      from: string;
      value: number;
      carried: number | null;
      stray: OpeningFigure | null;
      otherStrays: OpeningFigure[];
    };

export function openingNote({
  inUse,
  unused,
  thisMonth,
  firstMonth,
  carried,
}: {
  inUse: OpeningFigure | null;
  unused: OpeningFigure[];
  thisMonth: string;
  /** The workspace's own first month, where the field goes if none exists. */
  firstMonth: string;
  /** What this month starts with, once the chain is followed. */
  carried: number | null;
}): OpeningNote {
  const stray = unused.find((u) => u.month === thisMonth) ?? null;
  const otherStrays = unused.filter((u) => u.month !== thisMonth);

  if (!inUse) {
    // Nothing stored anywhere. Ask once, in the first month, and tell every
    // other month where to go — rather than putting the same empty box on
    // twelve screens and hoping the right one gets filled.
    return thisMonth === firstMonth
      ? { kind: "ask", field: true }
      : { kind: "ask_elsewhere", field: false, belongsOn: firstMonth };
  }

  if (inUse.month === thisMonth) {
    return { kind: "in_use", field: true, value: inUse.value, stray: null };
  }

  return {
    kind: "carried",
    // The box appears here only to let a stray be cleared. On a month with
    // no stray there is nothing to type, so there is no box.
    field: stray !== null,
    from: inUse.month,
    value: inUse.value,
    carried,
    stray,
    otherStrays,
  };
}
