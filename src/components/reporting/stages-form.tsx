"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { saveStages, savePrices, type LaunchState } from "@/lib/reporting/launch-actions";
import type { LaunchPrice, LaunchStage } from "@/lib/reporting/launch-queries";

/**
 * §6.1's stages and price options, one save each.
 *
 * All the stages together for the reason the Offers month is one save:
 * somebody filling this in is reading down a list, and five saves is five
 * chances to leave one behind. **An emptied name removes that row** — and
 * a stage with figures on it refuses, saying what to do, because the
 * foreign key restricts rather than cascading.
 *
 * **Two blank rows are always there, rather than an "add" button.** The
 * button was the first build and did nothing: it held its count in
 * `useState`, so before hydration it added no row at all — the third
 * time this project has shipped behaviour that only exists once the
 * JavaScript arrives. Blank rows are HTML, a save ignores the empty
 * ones, and saving a filled one brings two more.
 */

const STAGE_TYPES = [
  ["challenge", "Challenge"],
  ["masterclass", "Masterclass"],
  ["webinar", "Webinar"],
  ["workshop", "Workshop"],
  ["waitlist", "Waitlist"],
  ["open_cart", "Open cart"],
  ["other", "Other"],
] as const;

const field =
  "rounded-xl border border-ink/12 bg-card px-3 py-2 text-small text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30";

export function StagesForm({
  launchId,
  stages,
  locked,
}: {
  launchId: string;
  stages: LaunchStage[];
  locked: boolean;
}) {
  const [state, action] = useActionState<LaunchState, FormData>(saveStages, null);

  const highest = stages.reduce((max, s) => Math.max(max, s.position), 0);
  // Two spare, unless it is locked — a read-only screen showing empty
  // boxes nobody can type into is just noise.
  const rows = [...stages, ...(locked ? [] : [null, null])];
  const mainPosition = stages.find((s) => s.is_main_selling_stage)?.position ?? 0;

  return (
    <Card className="mt-6">
      <SectionTitle aside={`${stages.length} so far`}>The stages, in order</SectionTitle>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="launch_id" value={launchId} />

        <fieldset disabled={locked} className="contents">
          {rows.map((stage, index) => {
            const position = stage ? stage.position : highest + (index - stages.length) + 1;
            return (
              <div
                key={position}
                className="rounded-xl border border-ink/10 bg-cream-deep/40 p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">
                      Stage {position} — empty the name to remove it
                    </span>
                    <input
                      name={`stage:${position}:name`}
                      defaultValue={stage?.name ?? ""}
                      className={field}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">Type</span>
                    <select
                      name={`stage:${position}:type`}
                      defaultValue={stage?.stage_type ?? "other"}
                      className={field}
                    >
                      {STAGE_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">
                      Live days
                    </span>
                    <input
                      name={`stage:${position}:live_days`}
                      inputMode="numeric"
                      defaultValue={stage?.live_days ?? ""}
                      className={`${field} w-24 font-mono`}
                    />
                  </label>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  {([
                    ["promo_start", "Promo from", stage?.promo_start],
                    ["promo_end", "Promo to", stage?.promo_end],
                    ["live_start", "Live from", stage?.live_start],
                    ["live_end", "Live to", stage?.live_end],
                  ] as const).map(([name, label, value]) => (
                    <label key={name} className="flex flex-col gap-1">
                      <span className="text-caption uppercase tracking-wide text-ink/55">
                        {label}
                      </span>
                      <input
                        type="date"
                        name={`stage:${position}:${name}`}
                        defaultValue={value ?? ""}
                        className={`${field} font-mono`}
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">
                      Sign-up goal
                    </span>
                    <input
                      name={`stage:${position}:sign_up_goal`}
                      inputMode="numeric"
                      defaultValue={stage?.sign_up_goal ?? ""}
                      className={`${field} font-mono`}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">
                      Attendance goal
                    </span>
                    <input
                      name={`stage:${position}:attendance_goal`}
                      inputMode="numeric"
                      defaultValue={stage?.attendance_goal ?? ""}
                      className={`${field} font-mono`}
                    />
                  </label>
                </div>

                <label className="mt-3 flex items-center gap-2 text-small text-ink/70">
                  <input
                    type="radio"
                    name="main_stage"
                    value={position}
                    defaultChecked={mainPosition === position}
                    className="accent-[var(--aos-orange)]"
                  />
                  {/* §6.4 measures the conversion rate against this one
                      stage's attendees, so it is named here rather than
                      left to be inferred from a figure elsewhere. */}
                  Where the selling happened — the conversion rate is measured
                  against this stage
                </label>
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton label="Save the stages" disabled={locked} />
          <p
            aria-live="polite"
            className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
          >
            {state?.error ?? state?.notice ?? ""}
          </p>
        </div>
      </form>
    </Card>
  );
}

export function PricesForm({
  launchId,
  prices,
  locked,
}: {
  launchId: string;
  prices: LaunchPrice[];
  locked: boolean;
}) {
  const [state, action] = useActionState<LaunchState, FormData>(savePrices, null);

  const rows = [...prices, ...(locked ? [] : [null, null])];
  const mainSlot = prices.findIndex((p) => p.is_main) + 1;

  return (
    <Card className="mt-6">
      <SectionTitle aside={`${prices.length} so far`}>What it sold for</SectionTitle>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="launch_id" value={launchId} />

        <fieldset disabled={locked} className="contents">
          {rows.map((price, index) => {
            const slot = index + 1;
            return (
              <div key={slot} className="rounded-xl border border-ink/10 bg-cream-deep/40 p-3">
                <input type="hidden" name={`price:${slot}:id`} value={price?.id ?? ""} />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">
                      Name — empty it to remove this option
                    </span>
                    <input
                      name={`price:${slot}:name`}
                      defaultValue={price?.name ?? ""}
                      className={field}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">Price</span>
                    <input
                      name={`price:${slot}:price`}
                      inputMode="decimal"
                      defaultValue={price?.price ?? ""}
                      className={`${field} w-28 font-mono`}
                    />
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">
                      Instalments <span className="normal-case text-ink/45">if a plan</span>
                    </span>
                    <input
                      name={`price:${slot}:instalments`}
                      inputMode="numeric"
                      defaultValue={price?.instalments ?? ""}
                      className={`${field} font-mono`}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-caption uppercase tracking-wide text-ink/55">
                      Each instalment
                    </span>
                    <input
                      name={`price:${slot}:instalment_amount`}
                      inputMode="decimal"
                      defaultValue={price?.instalment_amount ?? ""}
                      className={`${field} font-mono`}
                    />
                  </label>
                </div>
                <label className="mt-3 flex items-center gap-2 text-small text-ink/70">
                  <input
                    type="radio"
                    name="main_price"
                    value={slot}
                    defaultChecked={mainSlot === slot}
                    className="accent-[var(--aos-orange)]"
                  />
                  The main price
                </label>
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton label="Save the prices" disabled={locked} />
          <p
            aria-live="polite"
            className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
          >
            {state?.error ?? state?.notice ?? ""}
          </p>
        </div>
        <p className="text-caption text-ink/50">
          A payment plan counts at its full contract value, not its instalment —
          §6.4, so revenue is what the launch will collect.
        </p>
      </form>
    </Card>
  );
}

function SaveButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
