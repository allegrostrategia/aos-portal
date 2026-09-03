/**
 * The SOP template (§8).
 *
 * The questions are the product. A member who has answered what starts this,
 * what it should end with, who does it, what it's done in, and the steps in
 * order has written a usable SOP — the AI generator this replaces would only
 * have rephrased those answers into prose.
 *
 * Pure, so the shape and its validation can be tested without a database.
 */

export type SopStep = { text: string };

export type Sop = {
  /** What starts this off — the thing that makes somebody do it. */
  trigger: string;
  /** What's true when it's finished, so anyone can tell it's done. */
  outcome: string;
  /** Whose job this is, by role rather than by name. */
  owner: string;
  tools: string[];
  /** A walkthrough, if they recorded one. */
  video_url: string | null;
  steps: SopStep[];
};

export const EMPTY_SOP: Sop = {
  trigger: "",
  outcome: "",
  owner: "",
  tools: [],
  video_url: null,
  steps: [],
};

/**
 * Read whatever is in the column, keeping only what the shape allows.
 *
 * Written defensively because this is jsonb: anything could be in there, and a
 * malformed row should render an incomplete SOP rather than break the page an
 * hour before somebody needs to hand it to a new starter.
 */
export function readSop(value: unknown): Sop {
  if (!value || typeof value !== "object") return { ...EMPTY_SOP };
  const raw = value as Record<string, unknown>;

  const text = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string).trim() : "";

  return {
    trigger: text("trigger"),
    outcome: text("outcome"),
    owner: text("owner"),
    tools: Array.isArray(raw.tools)
      ? raw.tools.filter((t): t is string => typeof t === "string" && t.trim() !== "")
      : [],
    video_url:
      typeof raw.video_url === "string" && raw.video_url.trim()
        ? raw.video_url.trim()
        : null,
    steps: Array.isArray(raw.steps)
      ? raw.steps
          .map((step) =>
            step && typeof step === "object" && typeof (step as SopStep).text === "string"
              ? { text: (step as SopStep).text.trim() }
              : { text: "" },
          )
          .filter((step) => step.text !== "")
      : [],
  };
}

/**
 * What's missing, in the member's own terms.
 *
 * Returned as a list rather than a boolean because a half-finished SOP is
 * normal — somebody writes the steps, gets interrupted, comes back. Saving is
 * always allowed; this is what the page tells them is still open, not a gate.
 */
export function missingFrom(sop: Sop): string[] {
  const missing: string[] = [];
  if (!sop.trigger) missing.push("what starts it off");
  if (!sop.outcome) missing.push("what done looks like");
  if (sop.steps.length === 0) missing.push("the steps");
  if (!sop.owner) missing.push("whose job it is");
  return missing;
}

/** Ready to hand to somebody else. */
export function isComplete(sop: Sop): boolean {
  return missingFrom(sop).length === 0;
}
