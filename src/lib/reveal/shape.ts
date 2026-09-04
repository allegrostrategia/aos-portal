/**
 * The roadmap reveal document's content (§1).
 *
 * §1 describes the shape: a diagnosis in three parts — their own words, what's
 * working, what isn't — then the first priorities, then where La Strada starts.
 * That structure is doing the work; it is what makes the document read as a
 * reading of them rather than a list of tasks.
 *
 * Pure, so the shape and its validation can be tested without a database.
 */

export type RevealPriority = { title: string; body: string };

export type Reveal = {
  preparedOn: string;
  baseline: string;
  startsOn: string;
  inTheirWords: string;
  whatsWorking: string;
  whatsNotWorking: string;
  priorities: RevealPriority[];
  roadNote: string;
};

export const EMPTY_REVEAL: Reveal = {
  preparedOn: "",
  baseline: "",
  startsOn: "",
  inTheirWords: "",
  whatsWorking: "",
  whatsNotWorking: "",
  priorities: [],
  roadNote: "",
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Priorities as stored — jsonb, so anything could be in there. */
export function readPriorities(value: unknown): RevealPriority[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const title = asText(item.title);
      const body = asText(item.body);
      // A priority with no title is a blank card on a document somebody is
      // handed in a meeting. Dropped rather than rendered empty.
      return title ? { title, body } : null;
    })
    .filter((p): p is RevealPriority => p !== null);
}

/**
 * What's missing, in the order the document reads.
 *
 * A list rather than a boolean: this gets written over a couple of sittings
 * after a call, and the editor should say what's still open rather than refuse
 * to save. Nothing here blocks saving.
 */
export function missingFromReveal(reveal: Reveal): string[] {
  const missing: string[] = [];
  if (!reveal.inTheirWords) missing.push("their own words");
  if (!reveal.whatsWorking) missing.push("what's working");
  if (!reveal.whatsNotWorking) missing.push("what isn't");
  if (reveal.priorities.length === 0) missing.push("the priorities");
  if (!reveal.roadNote) missing.push("where their road starts");
  return missing;
}

/** Ready to hand over. */
export function isRevealComplete(reveal: Reveal): boolean {
  return missingFromReveal(reveal).length === 0;
}
