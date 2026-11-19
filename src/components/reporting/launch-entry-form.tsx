"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { LaunchAdsUpload } from "./launch-ads-upload";
import { saveLaunchFigures, type LaunchState } from "@/lib/reporting/launch-actions";
import {
  emailFieldName,
  launchFieldName,
  sourceFieldName,
  sourceSlot,
  type LaunchFigures,
} from "@/lib/reporting/launch-fields";
import { signUpLabel } from "@/lib/reporting/stage-labels";
import type {
  LaunchEmail,
  LaunchPrice,
  LaunchRow,
  LaunchSource,
  LaunchStage,
} from "@/lib/reporting/launch-queries";

/**
 * §6.2 to §6.5, and Nina's final spec of 19 November: everything about a
 * launch that somebody types.
 *
 * **One save for the whole launch**, still — and now that includes the
 * two lists. The client's own sources and the row per email are written
 * by the same button as the figures, because somebody filling this in is
 * reading down a page and three saves is three chances to leave one
 * behind. `saveLaunchFigures` writes the lists first and then the
 * figures, which is what lets a brand-new source and the sign-ups
 * against it go in together.
 *
 * Every figure box is named
 * `launch:<metric>:<stage|->:<price|->:<source|->:<day|->:<email|->`, so
 * one parser handles all five contexts a launch figure can hang off and
 * nothing is inferred from a field name.
 *
 * Plain inputs and one form — no control here needs JavaScript to work.
 * The one exception is the Meta export card, which cannot read a file
 * without it and fills ordinary boxes that work without it.
 */

const field =
  "w-full rounded-xl border border-ink/12 bg-card px-3 py-2 font-num text-small text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30";
const textField =
  "w-full rounded-xl border border-ink/12 bg-card px-3 py-2 text-small text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30";

/** How many email rows a stage gets: what it has, plus two spare. */
function emailRowCount(emails: LaunchEmail[], values: LaunchFigures, stage: LaunchStage): number {
  let highest = emails
    .filter((e) => e.stage_id === stage.id)
    .reduce((max, e) => Math.max(max, e.number), 0);
  for (let n = 1; n <= 20; n += 1) {
    const any = (
      [
        "launches_email_open_rate",
        "launches_email_click_rate",
        "launches_email_list_size_sent_to",
        "launches_email_unique_clicks",
        "launches_email_clicked_no_sign_up",
      ] as const
    ).some((key) => values[launchFieldName(key, { stageId: stage.id, email: n })] != null);
    if (any) highest = Math.max(highest, n);
  }
  return Math.min(highest + 2, 20);
}

interface BoxValues {
  values: LaunchFigures;
  /** What the Meta export put in, before anybody saved. */
  filled: Record<string, number>;
}

/**
 * One box, which finds its own figure.
 *
 * It is handed the whole bag rather than a value, because its `name` is
 * the key — so the box cannot end up named one thing and filled from
 * another.
 *
 * **At module scope, not inside the form.** A component created during
 * render is a new type on every keystroke, so React unmounts and
 * remounts the input it returns and the caret jumps to the end of the
 * box being typed into. The lint rule that says so caught this the first
 * time it was written as a closure.
 *
 * A filled box is remounted deliberately, under a different `key`:
 * that is what makes an uncontrolled input pick up a new
 * `defaultValue`, and it is the only way the export can fill a box
 * without making every input on the screen controlled.
 */
function Box({ name, label, bag }: { name: string; label: string; bag: BoxValues }) {
  const filled = bag.filled[name];
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption uppercase tracking-wide text-ink/55">{label}</span>
      <input
        key={filled === undefined ? name : `${name}:filled`}
        name={name}
        inputMode="decimal"
        defaultValue={filled ?? bag.values[name] ?? ""}
        className={field}
      />
    </label>
  );
}

export function LaunchEntryForm({
  launch,
  stages,
  prices,
  sources,
  emails,
  days,
  values,
  locked,
  currency,
  returnTo,
}: {
  launch: LaunchRow;
  stages: LaunchStage[];
  prices: LaunchPrice[];
  sources: LaunchSource[];
  emails: LaunchEmail[];
  /** Every day of the launch, worked out from its stages on the server. */
  days: { day: number; date: string; label: string }[];
  /** Plain object, not the `LaunchValues` bag: a class holding a `Map`
   *  cannot cross into a Client Component. */
  values: LaunchFigures;
  locked: boolean;
  currency: string;
  /** The screen this form sits on, so a save can come back to it. */
  returnTo: string;
}) {
  const [state, action] = useActionState<LaunchState, FormData>(saveLaunchFigures, null);

  /**
   * What the Meta export put in the boxes, before anybody saved.
   *
   * **Three boxes, and only these**, so every other input on this
   * screen stays uncontrolled and keeps working with no JavaScript. A
   * filled box is remounted under a new `key`, which is what makes an
   * uncontrolled input pick up a new `defaultValue`.
   */
  const [filled, setFilled] = useState<Record<string, number>>({});

  /** Two blank rows for a new source, the same as the stages and prices. */
  const sourceRows = [...sources, ...(locked ? [] : [null, null])];

  /** What every box reads from: what is stored, and what the file filled. */
  const bag: BoxValues = { values, filled };

  const adBox = (metric: string) => launchFieldName(metric);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="launch_id" value={launch.id} />

      <fieldset disabled={locked} className="contents">
        {/* §6.2 — a block per stage */}
        {stages.map((stage) => {
          const dayCount = Math.max(stage.live_days ?? 1, 1);
          const rows = emailRowCount(emails, values, stage);
          const stageEmails = new Map(
            emails.filter((e) => e.stage_id === stage.id).map((e) => [e.number, e]),
          );

          return (
            <Card key={stage.id}>
              <SectionTitle aside={stage.is_main_selling_stage ? "the selling stage" : undefined}>
                {stage.name}
              </SectionTitle>

              <div className="grid gap-3 sm:grid-cols-3">
                {/* **Labelled by the stage's own type** (her item 1): a
                    challenge asks for challenge sign-ups, not for
                    "sign-ups" in a column of identical boxes. */}
                <Box bag={bag}
                  name={launchFieldName("launches_sign_ups", { stageId: stage.id })}
                  label={signUpLabel(stage.stage_type)}
                />
                <Box bag={bag}
                  name={launchFieldName("launches_replay_watchers", { stageId: stage.id })}
                  label="Replay watchers"
                />
              </div>

              <p className="mt-4 text-small font-medium text-ink">Live attendees, each day</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-5">
                {Array.from({ length: dayCount }, (_u, i) => (
                  <Box bag={bag}
                    key={i}
                    name={launchFieldName("launches_live_attendees", {
                      stageId: stage.id,
                      day: i + 1,
                    })}
                    label={`Day ${i + 1}`}
                  />
                ))}
              </div>

              {/* §6.2's pitch figures. Only worth asking where there is a
                  pitch, which is the stage the selling happened on. */}
              {stage.is_main_selling_stage ? (
                <>
                  <p className="mt-4 text-small font-medium text-ink">Around the pitch</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <Box bag={bag}
                      name={launchFieldName("launches_live_at_start", { stageId: stage.id })}
                      label="Live at start"
                    />
                    <Box bag={bag}
                      name={launchFieldName("launches_live_at_pitch", { stageId: stage.id })}
                      label="Live at pitch"
                    />
                    <Box bag={bag}
                      name={launchFieldName("launches_live_at_end_of_pitch", { stageId: stage.id })}
                      label="Live at end of pitch"
                    />
                  </div>
                  <p className="mt-1 text-caption text-ink/50">
                    Pitch retention is what is left at the end of the pitch out of
                    who was there when it began.
                  </p>
                </>
              ) : null}

              {/* Her item 9 — a row per email, with its words as well as
                  its figures. A resend is its own row: give it the next
                  number and tick the box. */}
              <p className="mt-5 text-small font-medium text-ink">The emails</p>
              <p className="mt-1 text-caption text-ink/50">
                One row each, in the order they went. A resend goes in as its
                own row with the box ticked.
              </p>
              <div className="mt-2 flex flex-col gap-3">
                {Array.from({ length: rows }, (_u, i) => {
                  const n = i + 1;
                  const row = stageEmails.get(n);
                  return (
                    <div
                      key={n}
                      className="rounded-xl border border-ink/10 bg-cream-deep/40 p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <p className="text-small font-medium text-ink sm:self-center sm:pb-2">
                          Email {n}
                        </p>
                        <label className="flex flex-col gap-1 sm:w-40">
                          <span className="text-caption uppercase tracking-wide text-ink/55">
                            Date sent
                          </span>
                          <input
                            type="date"
                            name={emailFieldName(stage.id, n, "sent_on")}
                            defaultValue={row?.sent_on ?? ""}
                            className={`${textField} font-num`}
                          />
                        </label>
                        <label className="flex flex-1 flex-col gap-1">
                          <span className="text-caption uppercase tracking-wide text-ink/55">
                            Subject line
                          </span>
                          <input
                            name={emailFieldName(stage.id, n, "subject")}
                            defaultValue={row?.subject ?? ""}
                            className={textField}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-small text-ink/70 sm:pb-2">
                          <input
                            type="checkbox"
                            name={emailFieldName(stage.id, n, "is_resend")}
                            value="yes"
                            defaultChecked={row?.is_resend ?? false}
                            className="accent-[var(--aos-orange)]"
                          />
                          Resend
                        </label>
                      </div>

                      <div className="mt-2 grid gap-3 sm:grid-cols-5">
                        <Box bag={bag}
                          name={launchFieldName("launches_email_list_size_sent_to", {
                            stageId: stage.id,
                            email: n,
                          })}
                          label="Sent to"
                        />
                        <Box bag={bag}
                          name={launchFieldName("launches_email_open_rate", {
                            stageId: stage.id,
                            email: n,
                          })}
                          label="Open %"
                        />
                        <Box bag={bag}
                          name={launchFieldName("launches_email_click_rate", {
                            stageId: stage.id,
                            email: n,
                          })}
                          label="Click %"
                        />
                        <Box bag={bag}
                          name={launchFieldName("launches_email_unique_clicks", {
                            stageId: stage.id,
                            email: n,
                          })}
                          label="Unique clicks"
                        />
                        <Box bag={bag}
                          name={launchFieldName("launches_email_clicked_no_sign_up", {
                            stageId: stage.id,
                            email: n,
                          })}
                          label="Clicked, no sign-up"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}

        {/* Her item 7 — sign-ups by day, for the running total */}
        {days.length > 0 ? (
          <Card>
            <SectionTitle aside={`${days.length} days`}>Sign-ups, day by day</SectionTitle>
            <p className="mt-1 text-caption text-ink/50">
              How many signed up on each day of the launch. The report adds
              them up as it goes, so the chart shows the climb rather than the
              daily bumps. Leave a day empty if nothing was counted — an empty
              day is not a zero.
            </p>
            <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
              {days.map((day) => (
                <Box bag={bag}
                  key={day.day}
                  name={launchFieldName("launches_sign_ups", { day: day.day })}
                  label={day.label}
                />
              ))}
            </div>
          </Card>
        ) : null}

        {/* Her item 6 — the client's own sources, with a target each */}
        <Card>
          <SectionTitle aside={`${sources.length} so far`}>Where they came from</SectionTitle>
          <p className="mt-1 text-caption text-ink/50">
            Your own list — name them however you think of them. Empty a name
            to remove that source. A target is what you were aiming for from
            it; the report shows how close it came.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {sourceRows.map((source, index) => {
              const slot = index + 1;
              return (
                <div
                  key={slot}
                  className="rounded-xl border border-ink/10 bg-cream-deep/40 p-3"
                >
                  <input
                    type="hidden"
                    name={sourceFieldName(slot, "id")}
                    value={source?.id ?? ""}
                  />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="text-caption uppercase tracking-wide text-ink/55">
                        Source — empty it to remove
                      </span>
                      <input
                        name={sourceFieldName(slot, "name")}
                        defaultValue={source?.name ?? ""}
                        placeholder="Email list, Meta ads, Instagram…"
                        className={textField}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-caption uppercase tracking-wide text-ink/55">
                        Sign-up target
                      </span>
                      <input
                        name={sourceFieldName(slot, "target")}
                        inputMode="numeric"
                        defaultValue={source?.sign_up_target ?? ""}
                        className={field}
                      />
                    </label>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-4">
                    {/* **An existing source's boxes are keyed by its id,
                        a new one's by its slot.** Both go through the one
                        builder, and the save turns a slot into the row it
                        has just written — so a source and its figures can
                        be typed and saved together. */}
                    <Box bag={bag}
                      name={launchFieldName("launches_sign_ups_from_source", {
                        sourceId: source?.id ?? sourceSlot(slot),
                      })}
                      label="Sign-ups"
                    />
                    <Box bag={bag}
                      name={launchFieldName("launches_sales_from_source", {
                        sourceId: source?.id ?? sourceSlot(slot),
                      })}
                      label="Sales"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

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
                <Box bag={bag}
                  key={price.id}
                  name={launchFieldName("launches_sales_per_price_option", { priceId: price.id })}
                  label={price.plan === "monthly" ? `${price.name} (monthly)` : price.name}
                />
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Box bag={bag}
              name={launchFieldName("launches_cash_collected_to_date")}
              label={`Cash collected (${currency})`}
            />
          </div>
          <p className="mt-1 text-caption text-ink/50">
            Revenue is worked out from the options above. Cash collected is what
            has actually arrived, so the report can say what is still to come.
          </p>
        </Card>

        {/* Her item 8 — the ads, with the Meta export above them */}
        {locked ? null : (
          <LaunchAdsUpload
            current={{
              launches_ad_spend: values[adBox("launches_ad_spend")] ?? null,
              launches_ad_clicks: values[adBox("launches_ad_clicks")] ?? null,
              launches_ad_leads: values[adBox("launches_ad_leads")] ?? null,
            }}
            onFill={(figures) =>
              setFilled((now) => {
                const next = { ...now };
                for (const [metric, value] of Object.entries(figures)) {
                  next[launchFieldName(metric)] = value;
                }
                return next;
              })
            }
          />
        )}

        <Card>
          <SectionTitle>What the ads did</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Box bag={bag} name={adBox("launches_ad_budget")} label={`Budget (${currency})`} />
            <Box bag={bag}
              name={adBox("launches_target_cost_per_sign_up")}
              label={`Target cost per sign-up (${currency})`}
            />
            <Box bag={bag} name={adBox("launches_ad_spend")} label={`Spent (${currency})`} />
            <Box bag={bag} name={adBox("launches_ad_clicks")} label="Link clicks" />
            <Box bag={bag} name={adBox("launches_ad_leads")} label="Sign-ups from ads" />
            <Box bag={bag} name={adBox("launches_ad_sales")} label="Sales from ads" />
          </div>
          <p className="mt-1 text-caption text-ink/50">
            The budget and the target are your plan. The rest is what happened —
            and the report works out what is left, the cost per sign-up and the
            cost per click.
          </p>
        </Card>

        {/* §6.5 — the pipeline */}
        <Card>
          <SectionTitle>DMs and calls</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["launches_dms_sent", "DMs sent"],
                ["launches_dm_replies", "DM replies"],
                ["launches_discovery_calls", "Discovery calls"],
                ["launches_sales_calls_booked", "Sales calls booked"],
                ["launches_sales_calls_closed", "Sales calls closed"],
                ["launches_not_interested", "Not interested"],
              ] as const
            ).map(([metric, label]) => (
              <Box bag={bag} key={metric} name={launchFieldName(metric)} label={label} />
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
