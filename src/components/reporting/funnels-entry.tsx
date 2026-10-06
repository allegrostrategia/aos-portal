"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Badge, Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { calculateFunnel, type FunnelMonth } from "@/lib/reporting/calculate";
import { formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import { priceCorrection } from "@/lib/reporting/funnel-price";
import {
  retireFunnel,
  saveFunnel,
  saveFunnelMonth,
  useCurrentOfferPrice,
  type FunnelState,
} from "@/lib/reporting/funnel-actions";
import type { ReportEntity } from "@/lib/reporting/queries";

/**
 * The Funnels entry screen (§5.5).
 *
 * One block per funnel, each linked to an offer — the same shape as
 * Offers and Ads, with one thing neither has: **the price this month's
 * revenue is worked out at is shown, and it is not editable here.**
 *
 * It was captured when the month was first saved and the month keeps it,
 * so a price rise in November cannot move October's revenue on a report
 * the client already has. Where the offer's price has since changed and
 * the month is still a draft, there is a button to take the new one —
 * deliberately a button, because a correction is a decision.
 */

export interface FunnelsEntryProps {
  workspaceId: string;
  month: string;
  monthLabel: string;
  published: boolean;
  previousLabel: string | null;
  currency: string;
  funnels: ReportEntity[];
  offers: { id: string; name: string; price: number | null }[];
  /** `${metricKey}|${funnelId}` → this month's figure. */
  values: Record<string, number | null>;
  previous: Record<string, number | null>;
}

const MONTH_FORM = "funnels-month";

const FIGURES = [
  { key: "funnels_landing_page_views", label: "Landing page views", unit: "count" as const },
  { key: "funnels_opt_ins", label: "Opt-ins", unit: "count" as const },
  { key: "funnels_sales_page_views", label: "Sales page views", unit: "count" as const, optional: true },
  { key: "funnels_checkouts_started", label: "Checkouts started", unit: "count" as const, optional: true },
  { key: "funnels_purchases", label: "Purchases", unit: "count" as const },
  { key: "funnels_order_bumps_taken", label: "Order bumps taken", unit: "count" as const, optional: true },
  { key: "funnels_upsells_taken", label: "Upsells taken", unit: "count" as const, optional: true },
];

export function FunnelsEntry(props: FunnelsEntryProps) {
  const [state, action] = useActionState<FunnelState, FormData>(saveFunnelMonth, null);

  const active = props.funnels.filter((f) => f.active);
  const retired = props.funnels.filter((f) => !f.active);

  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      active.flatMap((funnel) =>
        FIGURES.map((f) => [
          `${f.key}|${funnel.id}`,
          toInputValue(props.values[`${f.key}|${funnel.id}`]),
        ]),
      ),
    ),
  );

  const read = (key: string, id: string) => fromInputValue(typed[`${key}|${id}`] ?? "");
  const priceFor = (id: string) => props.values[`funnels_offer_price_at_month|${id}`] ?? null;
  const offerFor = (funnel: ReportEntity) =>
    props.offers.find((o) => o.id === funnel.linked_offer_id) ?? null;

  const rows: FunnelMonth[] = useMemo(
    () =>
      active.map((funnel) => ({
        id: funnel.id,
        name: funnel.name,
        linkedOfferId: funnel.linked_offer_id,
        landingPageViews: read("funnels_landing_page_views", funnel.id),
        optIns: read("funnels_opt_ins", funnel.id),
        salesPageViews: read("funnels_sales_page_views", funnel.id),
        checkoutsStarted: read("funnels_checkouts_started", funnel.id),
        purchases: read("funnels_purchases", funnel.id),
        orderBumps: read("funnels_order_bumps_taken", funnel.id),
        upsells: read("funnels_upsells_taken", funnel.id),
        priceAtMonth: priceFor(funnel.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, typed, props.values],
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <SectionTitle aside={`${active.length} running`}>Funnels</SectionTitle>
        <p className="mb-4 text-body text-ink/70">
          Each funnel sells one offer. Its revenue is purchases × that
          offer&rsquo;s price <strong>as it was when the month was saved</strong>, so a
          later price change cannot move a month the client has already read.
        </p>
        <div className="flex flex-col gap-3">
          {active.map((funnel) => (
            <FunnelSetup
              key={funnel.id}
              workspaceId={props.workspaceId}
              month={props.month}
              funnel={funnel}
              offers={props.offers}
            />
          ))}
          <FunnelSetup
            workspaceId={props.workspaceId}
            month={props.month}
            funnel={null}
            offers={props.offers}
          />
        </div>

        {retired.length > 0 ? (
          <details className="mt-4 border-t border-ink/8 pt-3">
            <summary className="cursor-pointer list-none text-small text-ink/60 underline underline-offset-4">
              {retired.length} retired
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {retired.map((funnel) => (
                <FunnelSetup
                  key={funnel.id}
                  workspaceId={props.workspaceId}
                  month={props.month}
                  funnel={funnel}
                  offers={props.offers}
                />
              ))}
            </div>
          </details>
        ) : null}
      </Card>

      {active.length === 0 ? null : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <SectionTitle>This month</SectionTitle>
            <form action={action} id={MONTH_FORM} className="contents">
              <input type="hidden" name="workspace_id" value={props.workspaceId} />
              <input type="hidden" name="month" value={props.month} />
            </form>

            <div className="flex flex-col gap-6">
              {active.map((funnel) => (
                <div
                  key={funnel.id}
                  className="border-t border-ink/8 pt-4 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-body font-medium text-ink">
                      {funnel.name}
                    </h3>
                    <PriceNote
                      workspaceId={props.workspaceId}
                      month={props.month}
                      monthLabel={props.monthLabel}
                      published={props.published}
                      funnelId={funnel.id}
                      captured={priceFor(funnel.id)}
                      offer={offerFor(funnel)}
                      currency={props.currency}
                    />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {FIGURES.map((figure) => {
                      const field = `${figure.key}|${funnel.id}`;
                      const last = props.previous[field];
                      return (
                        <div key={field} className="flex flex-col gap-1.5">
                          <label
                            htmlFor={`v-${field}`}
                            className="text-small font-medium text-ink"
                          >
                            {figure.label}
                            {figure.optional ? (
                              <span className="ml-1 text-ink/45">(optional)</span>
                            ) : null}
                          </label>
                          <input
                            id={`v-${field}`}
                            form={MONTH_FORM}
                            name={`v:${figure.key}:${funnel.id}`}
                            value={typed[field] ?? ""}
                            onChange={(event) =>
                              setTyped((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }))
                            }
                            inputMode="decimal"
                            autoComplete="off"
                            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 font-mono text-body text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
                          />
                          {last !== null && last !== undefined && props.previousLabel ? (
                            <p className="text-caption text-ink/55">
                              {props.previousLabel}:{" "}
                              {formatValue(last, figure.unit, props.currency)}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <MonthFooter state={state} />
          </Card>

          <WorkedOut rows={rows} currency={props.currency} />
        </div>
      )}
    </div>
  );
}

/**
 * The price this month is worked out at, and the one way to change it.
 *
 * Read-only on purpose. On a published month there is no button at all,
 * because there is nothing it could do.
 */
function PriceNote({
  workspaceId,
  month,
  monthLabel,
  published,
  funnelId,
  captured,
  offer,
  currency,
}: {
  workspaceId: string;
  month: string;
  monthLabel: string;
  published: boolean;
  funnelId: string;
  captured: number | null;
  offer: { id: string; name: string; price: number | null } | null;
  currency: string;
}) {
  const [state, action] = useActionState<FunnelState, FormData>(useCurrentOfferPrice, null);
  const correction = priceCorrection({
    stored: captured,
    published,
    offerPrice: offer?.price ?? null,
  });

  if (!offer) {
    return <Badge tone="neutral">No offer linked — revenue is a dash</Badge>;
  }

  return (
    <div className="text-right">
      <p className="text-caption text-ink/55">
        {captured === null ? (
          <>Price will be captured when this month is saved</>
        ) : (
          <>
            {monthLabel} uses{" "}
            <span className="font-mono text-ink">
              {formatValue(captured, "currency", currency)}
            </span>
            {published ? " · published, so it stays" : null}
          </>
        )}
      </p>

      {correction.offer ? (
        <form action={action} className="mt-1">
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="funnel_id" value={funnelId} />
          <button
            type="submit"
            className="text-small text-orange underline underline-offset-4 transition hover:text-ink"
          >
            Use the current price ({formatValue(correction.current, "currency", currency)})
          </button>
        </form>
      ) : null}

      {state?.error || state?.notice ? (
        <p
          aria-live="polite"
          className={`mt-1 text-caption ${state?.error ? "text-deep-red" : "text-ink/60"}`}
        >
          {state.error ?? state.notice}
        </p>
      ) : null}
    </div>
  );
}

function FunnelSetup({
  workspaceId,
  month,
  funnel,
  offers,
}: {
  workspaceId: string;
  month: string;
  funnel: ReportEntity | null;
  offers: { id: string; name: string; price: number | null }[];
}) {
  const [state, action] = useActionState<FunnelState, FormData>(saveFunnel, null);
  const [retireState, retireAction] = useActionState<FunnelState, FormData>(retireFunnel, null);

  return (
    <div className="rounded-xl bg-cream-deep/60 p-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="month" value={month} />
        {funnel ? <input type="hidden" name="funnel_id" value={funnel.id} /> : null}

        <div className="min-w-50 flex-1">
          <label
            htmlFor={`funnel-name-${funnel?.id ?? "new"}`}
            className="text-small font-medium text-ink"
          >
            {funnel ? "Name" : "Add a funnel"}
          </label>
          <input
            id={`funnel-name-${funnel?.id ?? "new"}`}
            name="name"
            defaultValue={funnel?.name ?? ""}
            placeholder={funnel ? "" : "What this funnel is called"}
            className="mt-1.5 w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
          />
        </div>

        <div className="min-w-50">
          <label
            htmlFor={`funnel-offer-${funnel?.id ?? "new"}`}
            className="text-small font-medium text-ink"
          >
            Sells
          </label>
          <select
            id={`funnel-offer-${funnel?.id ?? "new"}`}
            name="linked_offer_id"
            defaultValue={funnel?.linked_offer_id ?? ""}
            className="mt-1.5 w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
          >
            <option value="">No offer</option>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.name}
              </option>
            ))}
          </select>
        </div>

        <SetupButton existing={Boolean(funnel)} />
      </form>

      <p
        aria-live="polite"
        className={`mt-2 text-small ${state?.error || retireState?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {state?.error ?? state?.notice ?? retireState?.error ?? retireState?.notice ?? ""}
      </p>

      {funnel ? (
        <form action={retireAction} className="mt-1">
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <input type="hidden" name="funnel_id" value={funnel.id} />
          {funnel.active ? null : <input type="hidden" name="restore" value="1" />}
          <button
            type="submit"
            className="text-small text-ink/55 underline underline-offset-4 transition hover:text-ink"
          >
            {funnel.active ? "Retire this funnel" : "Put it back"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function SetupButton({ existing }: { existing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Saving…" : existing ? "Save" : "Add"}
    </Button>
  );
}

function MonthFooter({ state }: { state: FunnelState }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending
          ? "Saving…"
          : (state?.error ?? state?.notice ?? "Nothing is saved until you press save.")}
      </p>
      <Button type="submit" form={MONTH_FORM} disabled={pending}>
        Save this month
      </Button>
    </div>
  );
}

function WorkedOut({ rows, currency }: { rows: FunnelMonth[]; currency: string }) {
  return (
    <aside>
      <div className="rounded-card bg-lemon p-5">
        <h2 className="font-display text-heading font-medium text-ink">Worked out for you</h2>
        <Eyebrow className="mt-1.5">These update as you type</Eyebrow>

        <div className="mt-5 flex flex-col gap-6">
          {rows.map((row) => {
            const results = calculateFunnel(row);
            return (
              <div key={row.id} className="border-t border-ink/10 pt-4 first:border-0 first:pt-0">
                <h3 className="text-small font-medium text-ink">{row.name}</h3>
                <dl className="mt-2 flex flex-col gap-3">
                  {[
                    { label: "Opt-in rate", value: results.funnels_opt_in_rate, unit: "percent" as const },
                    { label: "Overall conversion", value: results.funnels_overall_conversion, unit: "percent" as const },
                    { label: "Funnel revenue", value: results.funnels_funnel_revenue, unit: "currency" as const },
                    { label: "Revenue per visitor", value: results.funnels_revenue_per_visitor, unit: "currency" as const },
                  ].map((line) => (
                    <div key={line.label}>
                      <dt className="text-caption text-ink/70">{line.label}</dt>
                      <dd className="font-mono text-body text-ink">
                        {formatValue(line.value ?? null, line.unit, currency)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
