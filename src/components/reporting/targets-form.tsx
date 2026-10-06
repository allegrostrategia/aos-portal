"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { formatValue, toInputValue } from "@/lib/reporting/format";
import { saveTargets, type TargetState } from "@/lib/reporting/target-actions";
import type { ReportMetric } from "@/lib/reporting/queries";

/**
 * Setting targets (§7).
 *
 * One per metric, either standing or for this month — "a target can be
 * one monthly figure or change by month". The month-specific one wins,
 * which is `getTargets`' rule and is said on the screen rather than left
 * to be discovered.
 *
 * Only metrics with a direction: a target for something that is neither
 * good up nor good down is not a target, it is a number sitting there.
 */

export interface TargetRow {
  metric: ReportMetric;
  standing: number | null;
  thisMonth: number | null;
}

export function TargetsForm({
  workspaceId,
  month,
  monthLabel,
  currency,
  groups,
}: {
  workspaceId: string;
  month: string;
  monthLabel: string;
  currency: string;
  groups: { category: string; label: string; rows: TargetRow[] }[];
}) {
  const [state, action] = useActionState<TargetState, FormData>(saveTargets, null);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <input type="hidden" name="month" value={month} />

      {groups.map((group) => (
        <Card key={group.category}>
          <SectionTitle>{group.label}</SectionTitle>
          <div className="flex flex-col gap-3">
            {group.rows.map(({ metric, standing, thisMonth }) => {
              const value = thisMonth ?? standing;
              const scope = thisMonth !== null ? "month" : "standing";
              return (
                <div
                  key={metric.key}
                  className="flex flex-wrap items-end gap-3 border-t border-ink/8 pt-3 first:border-0 first:pt-0"
                >
                  <div className="min-w-50 flex-1">
                    <label
                      htmlFor={`target-${metric.key}`}
                      className="text-small font-medium text-ink"
                    >
                      {metric.label}
                    </label>
                    <p className="text-caption text-ink/55">
                      {metric.good_direction === "up" ? "Higher is better" : "Lower is better"}
                      {standing !== null && thisMonth !== null
                        ? ` · standing target ${formatValue(standing, metric.unit, currency)}`
                        : ""}
                    </p>
                  </div>

                  <div className="w-32">
                    <input
                      id={`target-${metric.key}`}
                      name={`target:${metric.key}`}
                      defaultValue={toInputValue(value)}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="—"
                      className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 font-mono text-body text-ink outline-none transition placeholder:text-ink/40 focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
                    />
                  </div>

                  <div className="w-44">
                    <label htmlFor={`scope-${metric.key}`} className="sr-only">
                      Does this target apply to every month or only {monthLabel}?
                    </label>
                    <select
                      id={`scope-${metric.key}`}
                      name={`scope:${metric.key}`}
                      defaultValue={scope}
                      className="w-full rounded-xl border border-ink/12 bg-card px-3 py-2.5 text-small text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
                    >
                      <option value="standing">Every month</option>
                      <option value="month">{monthLabel} only</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <Footer state={state} />
    </form>
  );
}

function Footer({ state }: { state: TargetState }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending
          ? "Saving…"
          : (state?.error ??
            state?.notice ??
            "A month's own target wins over the standing one. Clearing a box removes it.")}
      </p>
      <Button type="submit" disabled={pending}>
        Save targets
      </Button>
    </div>
  );
}
