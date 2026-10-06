"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Badge, Card, SectionTitle } from "@/components/ui/card";
import { formatValue, toInputValue } from "@/lib/reporting/format";
import { saveTopItems, type TopItemState } from "@/lib/reporting/top-item-actions";
import { provenness, type TopItem, type TopItemType } from "@/lib/reporting/top-items";

/**
 * The top three hooks and the top three b-roll clips (§5.3).
 *
 * Words rather than figures, so they get their own block rather than a
 * row in the generic form — and the thing worth knowing about a hook is
 * not this month's views but that it keeps coming back. **"Proven" is in
 * the top three in two or more months**, counted across the client's
 * whole history.
 *
 * §5.3's other note — the one about a healthy profile-visit rate with a
 * follow rate below benchmark — is deliberately absent. It needs
 * benchmarks, which do not exist yet, and a hard-coded threshold
 * pretending to be one would be worse than no note at all (Dom, 5 Oct).
 */

const LISTS: { type: TopItemType; title: string; hint: string }[] = [
  {
    type: "hook",
    title: "Top three hooks",
    hint: "The opening line, as it was said or written on screen.",
  },
  {
    type: "b_roll",
    title: "Top three b-roll clips",
    hint: "What the footage was, in enough words to find it again.",
  },
];

export function TopItemsEntry({
  workspaceId,
  month,
  thisMonth,
  history,
}: {
  workspaceId: string;
  month: string;
  thisMonth: TopItem[];
  history: TopItem[];
}) {
  const [state, action] = useActionState<TopItemState, FormData>(saveTopItems, null);

  const at = (type: TopItemType, rank: number) =>
    thisMonth.find((item) => item.item_type === type && item.rank === rank) ?? null;

  return (
    <Card className="mt-6">
      <SectionTitle>What worked this month</SectionTitle>
      <p className="mb-4 text-body text-ink/70">
        Kept so they can be used again. Anything that reaches the top three in two
        different months is marked <strong>Proven</strong>.
      </p>

      <form action={action} className="flex flex-col gap-6">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="month" value={month} />

        {LISTS.map((list) => (
          <div key={list.type}>
            <h3 className="font-display text-body font-medium text-ink">{list.title}</h3>
            <p className="mb-3 text-caption text-ink/55">{list.hint}</p>

            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((rank) => {
                const item = at(list.type, rank);
                const seen = item
                  ? provenness({ item_type: list.type, body: item.body }, history)
                  : { proven: false, months: 0 };

                return (
                  <div key={rank} className="flex flex-wrap items-end gap-3">
                    <span aria-hidden className="mt-2.5 font-mono text-caption text-ink/45">
                      {rank}
                    </span>

                    <div className="min-w-50 flex-1">
                      <label
                        htmlFor={`item-${list.type}-${rank}`}
                        className="sr-only"
                      >
                        {list.title}, number {rank}
                      </label>
                      <input
                        id={`item-${list.type}-${rank}`}
                        name={`item:${list.type}:${rank}:body`}
                        defaultValue={item?.body ?? ""}
                        placeholder={rank === 1 ? "Leave blank if there wasn't one" : ""}
                        className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none transition placeholder:text-ink/40 focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
                      />
                    </div>

                    <div className="w-28">
                      <label
                        htmlFor={`item-${list.type}-${rank}-views`}
                        className="text-caption text-ink/55"
                      >
                        Views
                      </label>
                      <input
                        id={`item-${list.type}-${rank}-views`}
                        name={`item:${list.type}:${rank}:views`}
                        defaultValue={toInputValue(item?.views ?? null)}
                        inputMode="numeric"
                        className="mt-1 w-full rounded-xl border border-ink/12 bg-cream-deep px-3 py-2.5 font-mono text-body text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
                      />
                    </div>

                    <div className="pb-2.5">
                      {seen.proven ? (
                        <Badge tone="gold">Proven · {seen.months} months</Badge>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <Footer state={state} />
      </form>
    </Card>
  );
}

function Footer({ state }: { state: TopItemState }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending
          ? "Saving…"
          : (state?.error ?? state?.notice ?? "Clearing a line removes it.")}
      </p>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Save what worked
      </Button>
    </div>
  );
}

/** The same two lists, as the client reads them. */
export function TopItemsReport({
  thisMonth,
  history,
}: {
  thisMonth: TopItem[];
  history: TopItem[];
}) {
  const written = thisMonth.filter((item) => item.body.trim() !== "");
  if (written.length === 0) return null;

  return (
    <Card className="mt-6">
      <SectionTitle>What worked this month</SectionTitle>
      <div className="mt-2 grid gap-6 sm:grid-cols-2">
        {LISTS.map((list) => {
          const items = written
            .filter((item) => item.item_type === list.type)
            .sort((a, b) => a.rank - b.rank);
          if (items.length === 0) return null;

          return (
            <div key={list.type}>
              <h3 className="font-display text-body font-medium text-ink">{list.title}</h3>
              <ol className="mt-2 flex flex-col gap-3">
                {items.map((item) => {
                  const seen = provenness(item, history);
                  return (
                    <li key={item.id ?? `${item.item_type}-${item.rank}`} className="flex gap-3">
                      <span aria-hidden className="font-mono text-caption text-ink/45">
                        {item.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-body text-ink">{item.body}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-ink/55">
                          {item.views === null
                            ? null
                            : `${formatValue(item.views, "count")} views`}
                          {seen.proven ? (
                            <Badge tone="gold">Proven · {seen.months} months</Badge>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
