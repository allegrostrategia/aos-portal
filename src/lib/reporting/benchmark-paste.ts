/**
 * Reading a pasted benchmark reply (§7).
 *
 * **aOS never works a benchmark out.** §7's flow is that the client (or
 * Nina) takes a prompt built from their setup answers, asks whoever they
 * ask, and pastes the reply back. This reads that reply. It does not
 * estimate, infer, or fill a gap with an average — a number nobody said
 * is worse than no number, because a traffic light will be drawn from it.
 *
 * What comes back is prose, because it came from a person or a chat
 * window. So the parser is deliberately narrow: a line has to name a
 * metric this tool knows and carry one number, or it is unmatched and
 * said to be unmatched. **Every line that is not understood is handed
 * back**, so a client who pastes thirteen and gets four never has to
 * guess which nine were missed.
 */

export interface BenchmarkMetric {
  key: string;
  label: string;
  unit: string;
}

export interface PasteResult {
  matched: { key: string; label: string; value: number }[];
  unmatched: string[];
}

/** What two spellings of the same label have in common. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[%£$,]/g, " ")
    .replace(/[^a-z0-9. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The number on a line, if there is exactly one worth having.
 *
 * "Opt-in rate: 35%" is 35. "Between 30 and 40%" is **not** 35 — it is
 * two numbers and a judgement, and guessing which one somebody meant is
 * the thing this module exists not to do.
 */
function soleNumber(line: string): number | null {
  const numbers = line.match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (numbers.length !== 1) return null;
  const value = Number(numbers[0]);
  return Number.isFinite(value) ? value : null;
}

export function readBenchmarkReply(
  reply: string,
  metrics: BenchmarkMetric[],
): PasteResult {
  const byLabel = metrics.map((metric) => ({
    metric,
    needle: normalise(metric.label),
  }));

  const matched = new Map<string, { key: string; label: string; value: number }>();
  const unmatched: string[] = [];

  for (const rawLine of reply.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;

    const value = soleNumber(line);

    // **The name has to be the name, not something containing it.**
    // Matching on "contains" read "Webinar show-up rate: 48%" as the
    // Launches metric "Show-up rate" — a guess, and §7 is explicit that
    // aOS does not produce benchmarks. A wrong one is worse than a
    // missing one: it ends up behind a traffic light, read as fact.
    //
    // So the words before the number, with a leading "the" or "typical"
    // allowed, must be exactly a metric's label. Anything else is handed
    // back for a person to retype, which costs a line and risks nothing.
    const beforeNumber = value === null ? line : line.slice(0, line.search(/-?\d/));
    const named = normalise(beforeNumber).replace(/^(the|typical|average of)\s+/, "");
    const hit = byLabel.find((candidate) => candidate.needle === named);

    if (!hit || value === null) {
      unmatched.push(line);
      continue;
    }

    // A metric named twice keeps the first answer and the second line is
    // handed back, rather than one silently overwriting the other.
    if (matched.has(hit.metric.key)) {
      unmatched.push(line);
      continue;
    }

    matched.set(hit.metric.key, {
      key: hit.metric.key,
      label: hit.metric.label,
      value,
    });
  }

  return { matched: [...matched.values()], unmatched };
}
