"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { saveLaunchFigures, type LaunchState } from "@/lib/reporting/launch-actions";
import { launchFieldName, type LaunchFigures } from "@/lib/reporting/launch-fields";
import type { LaunchPrice, LaunchRow, LaunchStage } from "@/lib/reporting/launch-queries";

/**
 * §6.2 to §6.5: everything about a launch that somebody types.
 *
 * **One save for the whole launch**, for the reason the Offers month is
 * one save: somebody filling this in is reading down a page, and six
 * saves is six chances to leave one behind.
 *
 * Every box is named `launch:<metric>:<stage|->:<price|->:<day|->:<email|->`,
 * so one parser on the other side handles all four of the contexts a
 * launch figure can hang off, and nothing is inferred from a field name.
 *
 * Plain inputs and one form — no control here needs JavaScript to work,
 * which is now the standing rule rather than a preference.
 */

const field =
  "w-full rounded-xl border border-ink/12 bg-card px-3 py-2 font-mono text-small text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30";

/** How many email rows a stage gets: what it has, plus two spare. */
function emailRows(values: LaunchFigures, stage: LaunchStage): number {
  let highest = 0;
  for (let n = 1; n <= 20; n += 1) {
    const any = (["launches_email_open_rate", "launches_email_click_rate",
      "launches_email_list_size_sent_to", "launches_email_unique_clicks"] as const)
      .some((key) => values[launchFieldName(key, { stageId: stage.id, email: n })] != null);
    if (any) highest = n;
  }
  return Math.min(highest + 2, 20);
}

/**
 * One box, which finds its own figure.
 *
 * It is handed the whole bag rather than a value, because its `name` is
 * the key — so the box cannot end up named one thing and filled from
 * another.
 */
function Box({
  name,
  label,
  values,
}: {
  name: string;
  label: string;
  values: LaunchFigures;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption uppercase tracking-wide text-ink/55">{label}</span>
      <input
        name={name}
        inputMode="decimal"
        defaultValue={values[name] ?? ""}
        className={field}
      />
    </label>
  );
}

export function LaunchEntryForm({
  launch,
  stages,
  prices,
  values,
  locked,
  currency,
  returnTo,
}: {
  launch: LaunchRow;
  stages: LaunchStage[];
  prices: LaunchPrice[];
  /** Plain object, not the `LaunchValues` bag: a class holding a `Map`
   *  cannot cross into a Client Component. */
  values: LaunchFigures;
  locked: boolean;
  currency: string;
  /** The screen this form sits on, so a save can come back to it. */
  returnTo: string;
}) {
  const [state, action] = useActionState<LaunchState, FormData>(saveLaunchFigures, null);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="launch_id" value={launch.id} />

      <fieldset disabled={locked} className="contents">
        {/* §6.2 — a block per stage */}
        {stages.map((stage) => {
          const days = Math.max(stage.live_days ?? 1, 1);
          const emails = emailRows(values, stage);

          return (
            <Card key={stage.id}>
              <SectionTitle aside={stage.is_main_selling_stage ? "the selling stage" : undefined}>
                {stage.name}
              </SectionTitle>

              <div className="grid gap-3 sm:grid-cols-3">
                <Box
                  name={launchFieldName("launches_sign_ups", { stageId: stage.id })}
                  label="Sign-ups"
                  values={values}
                />
                <Box
                  name={launchFieldName("launches_replay_watchers", { stageId: stage.id })}
                  label="Replay watchers"
                  values={values}
                />
              </div>

              <p className="mt-4 text-small font-medium text-ink">Live attendees, each day</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-5">
                {Array.from({ length: days }, (_u, i) => (
                  <Box
                    key={i}
                    name={launchFieldName("launches_live_attendees", { stageId: stage.id, day: i + 1 })}
                    label={`Day ${i + 1}`}
                    values={values}
                  />
                ))}
              </div>

              {/* §6.2's pitch figures. Only worth asking where there is a
                  pitch, which is the stage the selling happened on. */}
              {stage.is_main_selling_stage ? (
                <>
                  <p className="mt-4 text-small font-medium text-ink">Around the pitch</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <Box
                      name={launchFieldName("launches_live_at_start", { stageId: stage.id })}
                      label="Live at start"
                      values={values}
                    />
                    <Box
                      name={launchFieldName("launches_live_at_pitch", { stageId: stage.id })}
                      label="Live at pitch"
                      values={values}
                    />
                    <Box
                      name={launchFieldName("launches_live_at_end_of_pitch", { stageId: stage.id })}
                      label="Live at end of pitch"
                      values={values}
                    />
                  </div>
                  <p className="mt-1 text-caption text-ink/50">
                    Pitch retention is what is left at the end of the pitch out of
                    who was there when it began.
                  </p>
                </>
              ) : null}

              {/* §6.3 — the emails of this stage */}
              <p className="mt-4 text-small font-medium text-ink">The emails</p>
              <div className="mt-2 flex flex-col gap-2">
                {Array.from({ length: emails }, (_u, i) => {
                  const n = i + 1;
                  return (
                    <div key={n} className="grid gap-3 sm:grid-cols-5">
                      <p className="self-end pb-2 text-small text-ink/60">Email {n}</p>
                      <Box
                        name={launchFieldName("launches_email_list_size_sent_to", { stageId: stage.id, email: n })}
                        label="Sent to"
                        values={values}
                      />
                      <Box
                        name={launchFieldName("launches_email_open_rate", { stageId: stage.id, email: n })}
                        label="Open %"
                        values={values}
                      />
                      <Box
                        name={launchFieldName("launches_email_click_rate", { stageId: stage.id, email: n })}
                        label="Click %"
                        values={values}
                      />
                      <Box
                        name={launchFieldName("launches_email_unique_clicks", { stageId: stage.id, email: n })}
                        label="Unique clicks"
                        values={values}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}

        {/* §6.4 — the sales */}
        <Card>
          <SectionTitle>What sold</SectionTitle>
          {prices.length === 0 ? (
            <p className="text-small text-ink/55">
              Add a price option on the setup screen and it appears here.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {prices.map((price) => (
                <Box
                  key={price.id}
                  name={launchFieldName("launches_sales_per_price_option", { priceId: price.id })}
                  label={price.name}
                  values={values}
                />
              ))}
            </div>
          )}

          <p className="mt-4 text-small font-medium text-ink">Where they came from</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {([
              ["launches_sales_from_stage", "Stage"],
              ["launches_sales_from_email", "Email"],
              ["launches_sales_from_dm", "DM"],
              ["launches_sales_from_ads", "Ads"],
              ["launches_sales_from_referral", "Referral"],
              ["launches_sales_from_unknown", "Unknown"],
            ] as const).map(([metric, label]) => (
              <Box key={metric} name={launchFieldName(metric)} label={label} values={values} />
            ))}
          </div>
          <p className="mt-1 text-caption text-ink/50">
            These should add up to the sales above. The report says so if they do
            not — some launches genuinely have sales nobody can place.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Box
              name={launchFieldName("launches_cash_collected_to_date")}
              label={`Cash collected (${currency})`}
              values={values}
            />
          </div>
        </Card>

        {/* §6.5 — pipeline and ads */}
        <Card>
          <SectionTitle>The pipeline, and what the ads did</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["launches_dms_sent", "DMs sent"],
              ["launches_dm_replies", "DM replies"],
              ["launches_discovery_calls", "Discovery calls"],
              ["launches_sales_calls_booked", "Sales calls booked"],
              ["launches_sales_calls_closed", "Sales calls closed"],
              ["launches_not_interested", "Not interested"],
              ["launches_ad_spend", `Ad spend (${currency})`],
              ["launches_ad_leads", "Ad leads"],
              ["launches_ad_sales", "Ad sales"],
            ] as const).map(([metric, label]) => (
              <Box key={metric} name={launchFieldName(metric)} label={label} values={values} />
            ))}
          </div>
        </Card>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton disabled={locked} />
        <p
          aria-live="polite"
          className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state?.error ?? ""}
        </p>
      </div>
    </form>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Saving…" : "Save this launch's figures"}
    </Button>
  );
}
