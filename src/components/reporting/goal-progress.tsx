import { formatValue } from "@/lib/reporting/format";

/**
 * Good, Better, Best — now, the goal, what is left, and "Goal hit!"
 * (Nina's item 4, 19 November).
 *
 * **One component, used twice**, which is what she asked for in those
 * words. Sign-ups and sales are the same question asked of two figures,
 * and before today the launch page had a hand-rolled version of it for
 * sales alone — three rows, a bar, and no "left to go" anywhere. Two
 * hand-rolled versions would have drifted apart by the second screen
 * that wanted one.
 *
 * **"Left to go" is the figure the old panel was missing**, and it is
 * the one somebody acts on: 135% of good is a fact, and "6 more for
 * better" is a thing to do this afternoon. It disappears rather than
 * going negative when the goal is passed, because a goal that is beaten
 * has nothing left to go and `-7` reads as a deficit.
 *
 * A level with no goal set is left out entirely rather than drawn empty:
 * a client who set Good and Best and not Better has two levels, not
 * three with a gap in the middle.
 */

export interface GoalLevel {
  label: "Good" | "Better" | "Best";
  target: number | null;
}

export function GoalProgress({
  now,
  levels,
  unit = "count",
  currency,
  noun,
}: {
  /** What it is at. Null is a dash, never a zero. */
  now: number | null;
  levels: GoalLevel[];
  unit?: "count" | "currency";
  currency?: string;
  /** "sign-ups", "sales" — what the numbers are of, for the sentences. */
  noun: string;
}) {
  const set = levels.filter((l): l is GoalLevel & { target: number } => l.target !== null);

  if (set.length === 0) {
    return (
      <p className="text-body text-ink/60">
        No {noun} goals set yet. Good, better and best go on the launch&rsquo;s
        setup screen.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {set.map((level) => {
        const percent = now === null ? null : (now / level.target) * 100;
        const left = now === null ? null : Math.max(0, level.target - now);
        const hit = now !== null && now >= level.target;

        return (
          <li key={level.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small">
              <span className="font-medium text-ink">
                {level.label}
                {hit ? (
                  <span className="ml-2 rounded-full bg-orange px-2 py-0.5 text-caption font-medium text-ink">
                    Goal hit!
                  </span>
                ) : null}
              </span>
              <span className="font-num text-ink/70">
                {now === null ? "—" : formatValue(now, unit, currency)} of{" "}
                {formatValue(level.target, unit, currency)}
                {percent === null ? null : (
                  <span className="ml-2 text-ink/50">{Math.round(percent)}%</span>
                )}
              </span>
            </div>

            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-cream-deep">
              <div
                className="h-full rounded-full bg-orange"
                style={{ width: `${Math.max(0, Math.min(percent ?? 0, 100))}%` }}
              />
            </div>

            <p className="mt-1 text-caption text-ink/55">
              {hit
                ? now === level.target
                  ? `Bang on ${level.label.toLowerCase()}.`
                  : `Past ${level.label.toLowerCase()} by ${formatValue(
                      (now as number) - level.target,
                      unit,
                      currency,
                    )}.`
                : left === null
                  ? `Nothing entered yet, so there is no telling what is left.`
                  : `${formatValue(left, unit, currency)} more ${noun} to go.`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
