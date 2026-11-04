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
  potentialRevenueOfferId,
  offerChoices,
  trackOfferHours,
  description,
  offers,
  country,
}: {
  workspaceId: string;
  returnTo: string;
  businessName: string;
  currency: string;
  targetHourlyRate: number | null;
  potentialRevenueOfferId: string | null;
  /** The client's offers, each already labelled with its price. */
  offerChoices: { id: string; label: string; hasPrice: boolean }[];
  trackOfferHours: boolean;
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

        {/* **Which offer the leads are for** (Nina, 3 November; Dom, 4
            November), for the two potential-revenue lines on Leads &
            Conversions. The price is not typed here: it is the chosen
            offer's own price, so the two screens cannot drift apart. A
            client has several offers and nothing in the figures says
            which one a lead is a lead for, which is why this is a choice
            and not a calculation. Blank is a real answer: it takes both
            lines off the page. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-ink">
            Offer used for potential revenue{" "}
            <span className="text-ink/45">
              {offerChoices.length === 0
                ? "set up an offer first, with a price on it"
                : "its price is what leads are multiplied by. Leave blank to show neither line."}
            </span>
          </span>
          <select
            name="potential_revenue_offer_id"
            defaultValue={potentialRevenueOfferId ?? ""}
            disabled={offerChoices.length === 0}
            className={field}
          >
            <option value="">Don&rsquo;t show potential revenue</option>
            {offerChoices.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.label}
              </option>
            ))}
          </select>
          {/* An offer with no price is choosable and shows nothing, which
              would be a mystery without this line. */}
          {offerChoices.some((o) => o.id === potentialRevenueOfferId && !o.hasPrice) ? (
            <span className="text-small text-ink/60">
              That offer has no price yet, so the figure is not shown. Add one on the Offers
              screen.
            </span>
          ) : null}
        </label>

        {/* **Hours on Offers, per client** (Nina, 3 November). §5.9 asks
            every offer for hours spent delivering, which is the figure
            that makes Offers worth filling in for a service business and
            a box nobody can answer for somebody selling a product — and
            a box nobody can answer is how a month gets abandoned
            half-done. Display only, like hiding a section: the hours
            already entered stay, and switching it back on brings them
            back. A checkbox for "yes" rather than "no", because a
            setting phrased as a negative is read wrongly by somebody
            scanning the page. */}
        <label className="flex items-start gap-2.5 py-1">
          <input
            type="checkbox"
            name="track_offer_hours"
            defaultChecked={trackOfferHours}
            className="mt-0.5 size-4 accent-orange"
          />
          <span className="text-small text-ink">
            Track hours on offers{" "}
            <span className="text-ink/55">
              asks for hours spent delivering each offer, and shows the effective hourly
              rate. Turning it off hides both; nothing already entered is lost.
            </span>
          </span>
        </label>

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
