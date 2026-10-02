"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { saveCategoryValues, type SaveState } from "@/lib/reporting/actions";
import { calculate } from "@/lib/reporting/calculate";
import type { CategoryKey } from "@/lib/reporting/categories";
import { formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import type { OfferMonth } from "@/lib/reporting/formulas";
import type { ReportMetric } from "@/lib/reporting/queries";

/**
 * "Enter your data" — the entry screen of the approved mockup.
 *
 * Generated from the metric list, not hand-written per category. §9: "a new
 * field or a new category is a new row in the metric list, not a database
 * change" — which is only true if it is not a code change either. One form,
 * five categories today and eleven later.
 *
 * This is a client component for one reason: §3 wants the calculated card
 * "updating live as numbers are typed". That is the only thing in the
 * reporting tool that genuinely needs JavaScript, and it re-runs the same
 * `calculate()` the report does, so the two cannot drift.
 */

export interface EntryFormProps {
  category: CategoryKey;
  categoryLabel: string;
  workspaceId: string;
  month: string;
  /** "August" — what the hint under each box is comparing to. */
  previousLabel: string | null;
  currency: string;
  core: ReportMetric[];
  optional: ReportMetric[];
  calculated: ReportMetric[];
  /**
   * The month's offers. Financials pulls its revenue from them, so the
   * live card needs them to work out the same totals the report does.
   */
  offerRows?: OfferMonth[];
  initial: Record<string, number | null>;
  previous: Record<string, number | null>;
  /** Where "Save and next" goes, or null on the last section. */
  nextHref: string | null;
  nextLabel: string | null;
}

export function EntryForm(props: EntryFormProps) {
  const [state, action] = useActionState<SaveState, FormData>(saveCategoryValues, null);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [...props.core, ...props.optional].map((m) => [
        m.key,
        toInputValue(props.initial[m.key]),
      ]),
    ),
  );

  // The live half of "Worked out for you". Recomputed on every keystroke,
  // which is cheap — these are a handful of divisions over a dozen numbers.
  const results = useMemo(
    () =>
      calculate(props.category, {
        value: (key) => fromInputValue(values[key] ?? ""),
        // Some formulas are defined against last month: follower growth, the
        // unsubscribe rate. Those come from the server and never change here.
        previous: (key) => props.previous[key] ?? null,
        // Offers are set on their own screen, so they do not change as you
        // type here — but Financials is worked out from them.
        offerRows: props.offerRows,
      }),
    [props.category, props.previous, props.offerRows, values],
  );

  const set = (key: string, raw: string) =>
    setValues((current) => ({ ...current, [key]: raw }));

  // Any core field still empty keeps the section unfinished (§8.1).
  const coreLeft = props.core.filter((m) => (values[m.key] ?? "").trim() === "").length;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="workspace_id" value={props.workspaceId} />
      <input type="hidden" name="month" value={props.month} />
      <input type="hidden" name="category" value={props.category} />

      {/* The grid holds the inputs and the panel and NOTHING ELSE.
          A sticky element is contained by its own containing block, and
          when the save bar was a third item in this grid that block
          included the save bar's row — so a panel taller than the viewport
          slid down over the buttons and made them unclickable. Found by Dom
          mid-walkthrough on 2 Oct. The save bar is a sibling now, so the
          panel physically cannot reach it at any height. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <SectionTitle
              aside={
                coreLeft === 0
                  ? "All filled in"
                  : `${coreLeft} still to fill in`
              }
            >
              {props.categoryLabel}
            </SectionTitle>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {props.core.map((metric) => (
                <NumberField
                  key={metric.key}
                  metric={metric}
                  value={values[metric.key] ?? ""}
                  onChange={(raw) => set(metric.key, raw)}
                  previous={props.previous[metric.key] ?? null}
                  previousLabel={props.previousLabel}
                  currency={props.currency}
                />
              ))}
            </div>
          </Card>

          {props.optional.length > 0 ? (
            <Card padded={false}>
              {/* §4: "Everything else sits behind '+ Add more detail
                  (optional)'." A <details> rather than a toggle so it works
                  before hydration and keeps its state without any of ours. */}
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 p-5 text-body font-medium text-ink sm:p-6">
                  <span
                    aria-hidden
                    className="flex size-6 items-center justify-center rounded-full bg-cream-deep text-ink/70"
                  >
                    +
                  </span>
                  Add more detail (optional)
                </summary>
                <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 sm:px-6 sm:pb-6 xl:grid-cols-3">
                  {props.optional.map((metric) => (
                    <NumberField
                      key={metric.key}
                      metric={metric}
                      value={values[metric.key] ?? ""}
                      onChange={(raw) => set(metric.key, raw)}
                      previous={props.previous[metric.key] ?? null}
                      previousLabel={props.previousLabel}
                      currency={props.currency}
                    />
                  ))}
                </div>
              </details>
            </Card>
          ) : null}
        </div>

        <WorkedOut
          metrics={props.calculated}
          results={results}
          currency={props.currency}
        />
      </div>

      <SaveBar state={state} nextHref={props.nextHref} nextLabel={props.nextLabel} />
    </form>
  );
}

/**
 * One input, with last month's figure under it (§3: "Input fields show last
 * month's figure in small grey text underneath").
 *
 * `inputMode="decimal"` rather than `type="number"`: a number input on a
 * phone hides the comma people paste, swallows scroll wheel changes on a
 * desktop, and rejects "24,850" outright. The parsing is ours anyway.
 */
function NumberField({
  metric,
  value,
  onChange,
  previous,
  previousLabel,
  currency,
}: {
  metric: ReportMetric;
  value: string;
  onChange: (raw: string) => void;
  previous: number | null;
  previousLabel: string | null;
  currency: string;
}) {
  const id = `v-${metric.key}`;
  const hintId = `${id}-hint`;
  const hint =
    previous !== null && previousLabel
      ? `${previousLabel}: ${formatValue(previous, metric.unit, currency)}`
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-ink">
        {metric.label}
      </label>
      <input
        id={id}
        name={`v:${metric.key}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        aria-describedby={hint ? hintId : undefined}
        className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 font-mono text-body text-ink outline-none transition placeholder:text-ink/40 focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
      />
      {hint ? (
        <p id={hintId} className="text-caption text-ink/55">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The lemon cream card of §3 — "Calculated results sit in a lemon cream card
 * marked 'Worked out for you', clearly different from inputs".
 *
 * Different on purpose: a different surface, no borders around the figures,
 * and nothing that looks like a box you could type in.
 */
function WorkedOut({
  metrics,
  results,
  currency,
}: {
  metrics: ReportMetric[];
  results: Record<string, number | null>;
  currency: string;
}) {
  if (metrics.length === 0) return null;

  return (
  // Sticky only where there is a second column to sit beside; and capped
    // to the screen with its own scroll, because a sticky element taller
    // than the viewport sticks with its lower half permanently below the
    // fold and no way to reach it.
    <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start lg:overflow-y-auto">
      <div className="rounded-card border border-gold/40 bg-lemon/60 p-5 shadow-soft sm:p-6">
        <h2 className="font-display text-heading font-medium text-ink">
          Worked out for you
        </h2>
        <Eyebrow className="mt-1.5">These update as you type</Eyebrow>

        <dl className="mt-5 flex flex-col gap-4">
          {metrics.map((metric) => (
            <div key={metric.key} className="border-t border-ink/10 pt-4 first:border-0 first:pt-0">
              <dt className="text-small text-ink/70">{metric.label}</dt>
              <dd className="font-mono text-heading text-ink">
                {formatValue(results[metric.key], metric.unit, currency)}
              </dd>
              {metric.formula ? (
                <p className="mt-0.5 text-caption text-ink/50">{metric.formula}</p>
              ) : null}
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

function SaveBar({
  state,
  nextHref,
  nextLabel,
}: {
  state: SaveState;
  nextHref: string | null;
  nextLabel: string | null;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-ink/8 bg-card p-4 shadow-soft sm:p-5">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/65"}`}
      >
        {pending
          ? "Saving…"
          : (state?.error ?? state?.notice ?? "Nothing is saved until you press save.")}
      </p>

      <div className="flex items-center gap-3">
        {/* Two submits, as the mockup draws them. The second carries the
            destination in its own value, so the move happens inside the
            action, after the save has landed. */}
        <Button type="submit" variant="secondary" disabled={pending}>
          Save draft
        </Button>
        {nextHref ? (
          <Button
            type="submit"
            name="next"
            value={nextHref}
            variant="primary"
            disabled={pending}
          >
            {nextLabel} →
          </Button>
        ) : null}
      </div>
    </div>
  );
}
