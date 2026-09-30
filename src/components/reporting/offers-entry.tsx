"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Badge, Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { calculate, calculateOffer } from "@/lib/reporting/calculate";
import { formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import type { OfferMonth } from "@/lib/reporting/formulas";
import {
  retireOffer,
  saveOffer,
  saveOfferMonth,
  type OfferState,
} from "@/lib/reporting/offer-actions";
import type { ReportEntity } from "@/lib/reporting/queries";

/**
 * The Offers entry screen (§5.9).
 *
 * The one Stage 2 category that is not a flat list of fields: an offer is set
 * up once — name, price, one-off or recurring, the hourly cost of the
 * client's own time — and then carries four figures a month. So the generic
 * entry form cannot serve it, and this does.
 *
 * Every offer's month goes in one save. Somebody entering a month reads down
 * a list of four numbers per offer, and four separate saves is four chances
 * to leave one behind.
 */

export interface OffersEntryProps {
  workspaceId: string;
  month: string;
  previousLabel: string | null;
  currency: string;
  offers: ReportEntity[];
  /** `${metricKey}|${offerId}` → this month's figure. */
  values: Record<string, number | null>;
  previous: Record<string, number | null>;
}

interface OfferFigure {
  key: string;
  label: string;
  /** §5.9: "Units sold" is labelled "Members" on a recurring offer. */
  recurringLabel?: string;
  unit: "count" | "currency" | "hours";
  optional?: boolean;
}

/** The id the month's inputs attach themselves to. */
const MONTH_FORM = "offers-month";

const FIGURES: OfferFigure[] = [
  { key: "offers_units_sold", label: "Units sold", recurringLabel: "Members", unit: "count" },
  { key: "offers_revenue_this_month", label: "Revenue this month", unit: "currency" },
  { key: "offers_hours_spent_delivering", label: "Hours spent delivering", unit: "hours" },
  { key: "offers_other_direct_costs", label: "Other direct costs", unit: "currency", optional: true },
];

export function OffersEntry(props: OffersEntryProps) {
  const [state, action] = useActionState<OfferState, FormData>(saveOfferMonth, null);

  const active = props.offers.filter((o) => o.active);
  const retired = props.offers.filter((o) => !o.active);

  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      active.flatMap((offer) =>
        FIGURES.map((f) => [
          `${f.key}|${offer.id}`,
          toInputValue(props.values[`${f.key}|${offer.id}`]),
        ]),
      ),
    ),
  );

  const read = (key: string, offerId: string) =>
    fromInputValue(typed[`${key}|${offerId}`] ?? "");

  const rows: OfferMonth[] = useMemo(
    () =>
      active.map((offer) => ({
        name: offer.name,
        hourlyCost: offer.hourly_cost,
        pricingModel: offer.pricing_model ?? undefined,
        unitsSold: read("offers_units_sold", offer.id),
        revenue: read("offers_revenue_this_month", offer.id),
        hoursSpent: read("offers_hours_spent_delivering", offer.id),
        otherDirectCosts: read("offers_other_direct_costs", offer.id),
      })),
    // `typed` is what changes; `active` comes from the server and does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typed, active],
  );

  const summary = useMemo(
    () => calculate("offers", { value: () => null, previous: () => null, offerRows: rows }),
    [rows],
  );

  return (
    <div className="flex flex-col gap-6">
      <Summary results={summary} currency={props.currency} />

      <div className="flex flex-col gap-6">
        {active.length === 0 ? (
          <Card>
            <SectionTitle>No offers set up yet</SectionTitle>
            <p className="text-body text-ink/70">
              Add each thing the client sells below. Set it up once — the price
              and the hourly cost of their own delivery time — and then it only
              needs four numbers a month.
            </p>
          </Card>
        ) : null}

        {active.map((offer, index) => {
          const row = rows[index];
          const worked = calculateOffer(row, summary.offers_total_revenue_from_offers);
          return (
            <Card key={offer.id}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-heading font-medium text-ink">
                  {offer.name}
                </h3>
                <div className="flex items-center gap-3">
                  <Badge tone={offer.pricing_model === "recurring" ? "sky" : "neutral"}>
                    {offer.pricing_model === "recurring" ? "Recurring" : "One-off"}
                  </Badge>
                  <span className="font-mono text-small text-ink/60">
                    {formatValue(offer.price, "currency", props.currency)}
                    {offer.pricing_model === "recurring" ? " / month" : null}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {FIGURES.map((figure) => {
                  const name = `v:${figure.key}:${offer.id}`;
                  const previous = props.previous[`${figure.key}|${offer.id}`] ?? null;
                  const label =
                    offer.pricing_model === "recurring" && figure.recurringLabel
                      ? figure.recurringLabel
                      : figure.label;
                  return (
                    <div key={figure.key} className="flex flex-col gap-1.5">
                      <label htmlFor={name} className="text-small font-medium text-ink">
                        {label}
                        {figure.optional ? (
                          <span className="ml-1 text-ink/45">(optional)</span>
                        ) : null}
                      </label>
                      <input
                        id={name}
                        name={name}
                        value={typed[`${figure.key}|${offer.id}`] ?? ""}
                        onChange={(event) =>
                          setTyped((current) => ({
                            ...current,
                            [`${figure.key}|${offer.id}`]: event.target.value,
                          }))
                        }
                        form={MONTH_FORM}
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 font-mono text-body text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
                      />
                      {previous !== null && props.previousLabel ? (
                        <p className="text-caption text-ink/55">
                          {props.previousLabel}:{" "}
                          {formatValue(previous, figure.unit, props.currency)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 rounded-2xl bg-lemon/50 px-4 py-3">
                <Worked label="Delivery cost" value={worked.offers_delivery_cost} unit="currency" currency={props.currency} />
                <Worked label="Margin" value={worked.offers_margin} unit="percent" currency={props.currency} />
                <Worked label="Effective hourly rate" value={worked.offers_effective_hourly_rate} unit="currency" currency={props.currency} />
                <Worked label="Share of revenue" value={worked.offers_share_of_total_revenue} unit="percent" currency={props.currency} />
              </dl>

              <OfferSetup
                workspaceId={props.workspaceId}
                offer={offer}
                currency={props.currency}
              />
            </Card>
          );
        })}

      </div>

      {/* The month's figures live in THEIR OWN form, a sibling of the cards
          rather than a wrapper around them, with each input pointing at it
          by id. A <form> inside a <form> is invalid HTML and React refuses
          to hydrate it — which is exactly what the first version of this
          screen did, with a comment above it claiming otherwise. The cards
          hold setup forms, so the monthly form cannot contain the cards. */}
      {active.length > 0 ? (
        <form id={MONTH_FORM} action={action}>
          <input type="hidden" name="workspace_id" value={props.workspaceId} />
          <input type="hidden" name="month" value={props.month} />
          <SaveBar state={state} />
        </form>
      ) : null}

      <AddOffer workspaceId={props.workspaceId} />

      {retired.length > 0 ? (
        <Card>
          <SectionTitle aside={`${retired.length}`}>Retired offers</SectionTitle>
          <p className="mb-3 text-small text-ink/60">
            Kept, not deleted — their past months are unchanged.
          </p>
          <ul className="flex flex-col gap-2">
            {retired.map((offer) => (
              <li key={offer.id} className="flex items-center justify-between gap-3">
                <span className="text-body text-ink/75">{offer.name}</span>
                <RetireForm
                  workspaceId={props.workspaceId}
                  offerId={offer.id}
                  restore
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Worked({
  label,
  value,
  unit,
  currency,
}: {
  label: string;
  value: number | null;
  unit: "currency" | "percent";
  currency: string;
}) {
  return (
    <div>
      <dt className="text-caption text-ink/60">{label}</dt>
      <dd className="font-mono text-body text-ink">
        {formatValue(value, unit, currency)}
      </dd>
    </div>
  );
}

/** The four summary cards of §5.9, worked out across every offer. */
function Summary({
  results,
  currency,
}: {
  results: Record<string, number | null>;
  currency: string;
}) {
  const cards = [
    ["Total revenue from offers", results.offers_total_revenue_from_offers, "currency"],
    ["Overall margin", results.offers_overall_margin, "percent"],
    ["Hours spent delivering", results.offers_total_hours_spent_delivering, "hours"],
    ["Effective hourly rate", results.offers_overall_effective_hourly_rate, "currency"],
  ] as const;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, unit]) => (
        <div
          key={label}
          className="rounded-card border border-gold/40 bg-lemon/60 p-5 shadow-soft"
        >
          <Eyebrow>{label}</Eyebrow>
          <p className="font-mono mt-2 text-[1.5rem] leading-tight tracking-tight text-ink tabular-nums">
            {formatValue(value, unit, currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Setup, behind a disclosure.
 *
 * Its own form, nested beside the monthly one rather than inside it — HTML
 * forbids a form inside a form, and setup is a different kind of change from
 * this month's figures anyway.
 */
function OfferSetup({
  workspaceId,
  offer,
  currency,
}: {
  workspaceId: string;
  offer: ReportEntity;
  currency: string;
}) {
  return (
    <details className="group mt-4 border-t border-ink/8 pt-3">
      <summary className="cursor-pointer list-none text-small text-ink/60 underline underline-offset-4 transition hover:text-ink">
        Edit setup
      </summary>
      <div className="mt-3">
        <OfferFields
          workspaceId={workspaceId}
          offer={offer}
          currency={currency}
          submitLabel="Save setup"
        />
        {/* Retiring is its own action, so its own form — beside the setup
            form, never inside it, and never taking a half-typed edit with
            it. */}
        <RetireForm
          id={`retire-${offer.id}`}
          workspaceId={workspaceId}
          offerId={offer.id}
          restore={false}
        />
      </div>
    </details>
  );
}

function AddOffer({ workspaceId }: { workspaceId: string }) {
  return (
    <Card padded={false}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-5 text-body font-medium text-ink sm:p-6">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-full bg-cream-deep text-ink/70"
          >
            +
          </span>
          Add an offer
        </summary>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <OfferFields workspaceId={workspaceId} offer={null} currency="GBP" submitLabel="Add offer" />
        </div>
      </details>
    </Card>
  );
}

function OfferFields({
  workspaceId,
  offer,
  currency,
  submitLabel,
}: {
  workspaceId: string;
  offer: ReportEntity | null;
  currency: string;
  submitLabel: string;
}) {
  const [state, action] = useActionState<OfferState, FormData>(saveOffer, null);
  const id = offer?.id ?? "new";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      {offer ? <input type="hidden" name="offer_id" value={offer.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`name-${id}`} className="text-small font-medium text-ink">Name</label>
          <input
            id={`name-${id}`} name="name" defaultValue={offer?.name ?? ""} required
            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`price-${id}`} className="text-small font-medium text-ink">
            Price ({currency})
          </label>
          <input
            id={`price-${id}`} name="price" inputMode="decimal"
            defaultValue={toInputValue(offer?.price ?? null)}
            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 font-mono text-body text-ink outline-none focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`model-${id}`} className="text-small font-medium text-ink">Type</label>
          <select
            id={`model-${id}`} name="pricing_model"
            defaultValue={offer?.pricing_model ?? "one_off"}
            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 text-body text-ink outline-none focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
          >
            <option value="one_off">One-off</option>
            <option value="recurring">Recurring</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`cost-${id}`} className="text-small font-medium text-ink">
            Your hourly cost
          </label>
          <input
            id={`cost-${id}`} name="hourly_cost" inputMode="decimal"
            defaultValue={toInputValue(offer?.hourly_cost ?? null)}
            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 font-mono text-body text-ink outline-none focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
          />
          <p className="text-caption text-ink/55">What an hour of their own delivery time costs.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          aria-live="polite"
          className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state?.error ?? state?.notice ?? ""}
        </p>
        <div className="flex items-center gap-3">
          {offer ? (
            <Button type="submit" form={`retire-${offer.id}`} variant="ghost" size="sm">
              Retire
            </Button>
          ) : null}
          <SubmitButton label={submitLabel} />
        </div>
      </div>
    </form>
  );
}

/**
 * Retiring, as its own form.
 *
 * Nested forms are invalid HTML, so this sits beside the setup form rather
 * than inside it — which also means retiring never silently saves an
 * edit-in-progress alongside it.
 */
function RetireForm({
  id,
  workspaceId,
  offerId,
  restore,
}: {
  id?: string;
  workspaceId: string;
  offerId: string;
  restore: boolean;
}) {
  const [state, action] = useActionState<OfferState, FormData>(retireOffer, null);
  return (
    <form id={id} action={action} className="flex items-center gap-3">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <input type="hidden" name="offer_id" value={offerId} />
      {restore ? <input type="hidden" name="restore" value="1" /> : null}
      {/* With an id, the button that submits this lives in the setup form's
          footer and points here; without one, the button is right here. */}
      {id ? null : (
        <Button type="submit" variant="ghost" size="sm">
          Put back
        </Button>
      )}
      {state?.error ? <span className="text-caption text-deep-red">{state.error}</span> : null}
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function SaveBar({ state }: { state: OfferState }) {
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
      <Button type="submit" variant="primary" disabled={pending}>
        Save this month
      </Button>
    </div>
  );
}
