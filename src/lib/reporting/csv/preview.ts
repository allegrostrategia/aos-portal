import type { ImportResult } from "./meta-content.ts";

/**
 * What an upload would do, before it does any of it.
 *
 * §10.3: "Filled boxes are highlighted so the person can see what came
 * from the file. Nothing saves until they press Save." This is the
 * comparison that makes the highlight mean something.
 *
 * **The case this exists for** (Dom, 9 October): a box that already
 * holds a different number. Somebody typed it, or corrected it after
 * the last upload, and a file quietly replacing it is the one thing an
 * import must never do without being seen. So every changed box is
 * listed as old → new, and nothing is written until somebody confirms.
 */

export type PreviewRow =
  | { key: string; label: string; status: "new"; to: number }
  | { key: string; label: string; status: "same"; to: number }
  | { key: string; label: string; status: "changed"; from: number; to: number };

export interface Preview {
  rows: PreviewRow[];
  /** Just the ones that would overwrite a different number. */
  changed: PreviewRow[];
  cannotFill: string[];
  rowsUsed: number;
  rowsOutsideMonth: number;
  problem?: string;
}

export function buildPreview(
  result: ImportResult,
  /** What is in the boxes now: metric key to value, or null. */
  current: Record<string, number | null>,
  labels: Record<string, string>,
): Preview {
  if (result.problem) {
    return {
      rows: [],
      changed: [],
      cannotFill: result.cannotFill,
      rowsUsed: 0,
      rowsOutsideMonth: result.rowsOutsideMonth,
      problem: result.problem,
    };
  }

  const rows: PreviewRow[] = Object.entries(result.figures).map(([key, to]) => {
    const label = labels[key] ?? key;
    const from = current[key];
    if (from === null || from === undefined) return { key, label, status: "new", to };
    // A figure that matches is not a change, and saying so keeps the
    // list of changes short enough to actually read.
    if (from === to) return { key, label, status: "same", to };
    return { key, label, status: "changed", from, to };
  });

  return {
    rows,
    changed: rows.filter((row) => row.status === "changed"),
    cannotFill: result.cannotFill,
    rowsUsed: result.rowsUsed,
    rowsOutsideMonth: result.rowsOutsideMonth,
  };
}
