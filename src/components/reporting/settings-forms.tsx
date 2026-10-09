"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import {
  saveHiddenCategories,
  saveReportSettings,
  type SettingsState,
} from "@/lib/reporting/settings-actions";

/**
 * §8.1 and §10.3: the business, and which sections it uses.
 *
 * Two plain forms. Success redirects to `?saved=` and the page renders
 * the sentence, so neither needs JavaScript to tell you it worked;
 * `useActionState` is here for the refusals, which should leave what was
 * typed in the boxes.
 */

const field =
  "w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30";

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Error({ state }: { state: SettingsState }) {
  return (
    <p aria-live="polite" className="text-small text-deep-red">
      {state?.error ?? ""}
    </p>
  );
}

export function BusinessForm({
  workspaceId,
  returnTo,
  businessName,
  currency,
  targetHourlyRate,
  description,
  offers,
  country,
}: {
  workspaceId: string;
  returnTo: string;
  businessName: string;
  currency: string;
  targetHourlyRate: number | null;
  description: string | null;
  offers: string | null;
  country: string | null;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveReportSettings, null);

  return (
    <Card className="mb-6">
      <SectionTitle>Your business</SectionTitle>
      <form action={action} className="mt-3 flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="return_to" value={returnTo} />

        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-ink">What the business is called</span>
          <input name="business_name" defaultValue={businessName} required className={field} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink">Currency</span>
            <input
              name="currency"
              defaultValue={currency}
              maxLength={3}
              className={`${field} font-mono uppercase`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink">
              Target hourly rate <span className="text-ink/45">optional</span>
            </span>
            <input
              name="target_hourly_rate"
              inputMode="decimal"
              defaultValue={targetHourlyRate ?? ""}
              className={`${field} font-mono`}
            />
          </label>
        </div>

        <fieldset className="contents">
          <legend className="text-small font-medium text-ink">
            For the benchmark prompt{" "}
            <span className="text-ink/45">
              what you paste into Claude when you want figures to compare against
            </span>
          </legend>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption uppercase tracking-wide text-ink/55">
              What the business does
            </span>
            <input name="benchmark_business_description" defaultValue={description ?? ""} className={field} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-caption uppercase tracking-wide text-ink/55">Main offers</span>
              <input name="benchmark_main_offers" defaultValue={offers ?? ""} className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-caption uppercase tracking-wide text-ink/55">Country</span>
              <input name="benchmark_country" defaultValue={country ?? ""} className={field} />
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Save label="Save" />
          <Error state={state} />
        </div>
      </form>
    </Card>
  );
}

export function SectionsForm({
  workspaceId,
  returnTo,
  categories,
  hidden,
}: {
  workspaceId: string;
  returnTo: string;
  categories: { key: string; label: string }[];
  hidden: string[];
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveHiddenCategories, null);

  return (
    <Card className="mb-6">
      <SectionTitle>The sections you use</SectionTitle>
      <p className="mt-2 text-body text-ink/70">
        Turn off anything that does not apply to you. A section you turn
        off stops being asked for and stops appearing on your report —
        nothing is deleted, and turning it back on brings everything back
        exactly as it was.
      </p>

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="return_to" value={returnTo} />

        <ul className="flex flex-col gap-1">
          {categories.map((category) => (
            <li key={category.key}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-cream-deep">
                {/* What is SHOWN is sent, because an unticked checkbox
                    sends nothing — reading "hidden" off absent boxes
                    could not tell an unticked one from a field that was
                    never rendered. */}
                <input
                  type="checkbox"
                  name="shown"
                  value={category.key}
                  defaultChecked={!hidden.includes(category.key)}
                  className="size-4 accent-orange"
                />
                <span className="text-body text-ink">{category.label}</span>
              </label>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <Save label="Save the sections" />
          <Error state={state} />
        </div>
      </form>
    </Card>
  );
}
