"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "./icons";
import { DASH, formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import {
  BESPOKE_ID,
  BESPOKE_LABEL,
  callWinRows,
  callWinTotals,
} from "@/lib/reporting/call-wins";
import { saveCallWins, type CallWinsState } from "@/lib/reporting/call-wins-actions";

/**
 * What the month's calls bought, offer by offer (§5.6).
 *
 * Nina, 16 November: "add calls converted and what they bought (by offer,
 * with revenue)". Under the month's form rather than inside it, the way
 * §5.3's two lists are, because these figures hang off an offer and the
 * form above holds the month's.
 *
 * **One box per offer, and no value box on those rows.** The value is the
 * sales times the offer's own price, which is already set up on the Offers
 * screen — typing it again here is the second place a number could be
 * entered and the first place two screens could disagree. The total updates
 * as you type so the arithmetic is visible before the save rather than
 * after it.
 *
 * **The bespoke line is the exception, and it has both boxes** (Dom, 16
 * November). Work priced per job has no offer row and no price, so there is
 * nothing to multiply — and for an agency client it is often most of the
 * month. A breakdown that could only describe packaged offers would quietly
 * leave their biggest wins out.
 *
 * An offer with no price shows a dash for its value, never £0: it did not
 * earn nothing, we have no price to work it out with (§4, Dom 5 October).
 */

const field =
  "w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-right font-num text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save what they bought"}
    </Button>
  );
}

export interface CallWinOffer {
  id: string;
  name: string;
  price: number | null;
  sales: number | null;
}

export function CallWinsEntry({
  workspaceId,
  month,
  here,
  currency,
  offers,
  bespoke,
  converted,
}: {
  workspaceId: string;
  month: string;
  /** Where the save comes back to, carrying `?saved=`. */
  here: string;
  currency: string;
  offers: CallWinOffer[];
  bespoke: { sales: number | null; value: number | null };
  /** This month's calls converted, to say when the rows do not add up to it. */
  converted: number | null;
}) {
  const [state, action] = useActionState<CallWinsState, FormData>(saveCallWins, null);
  const [typed, setTyped] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(offers.map((o) => [o.id, toInputValue(o.sales)])),
    "bespoke:sales": toInputValue(bespoke.sales),
    "bespoke:value": toInputValue(bespoke.value),
  }));

  const at = (key: string) => fromInputValue(typed[key] ?? "");

  /**
   * The same row builder the report draws from, fed what is in the boxes
   * rather than what is stored. One arithmetic, so the running total here
   * and the table a client reads cannot come to two different answers.
   */
  const rows = callWinRows(
    offers.map((offer) => ({
      id: offer.id,
      name: offer.name,
      price: offer.price,
      salesFromCalls: at(offer.id),
    })),
    { sales: at("bespoke:sales"), value: at("bespoke:value") },
  );
  const { sales: sold, value: total, unpriced } = callWinTotals(rows);
  const valueOf = (id: string) => rows.find((r) => r.id === id)?.value ?? null;
  const unaccounted = converted === null ? null : converted - sold;

  const hasOffers = offers.length > 0;

  return (
    <Card className="mt-6">
      <SectionTitle icon={<IconCircle name="offers" tone="gold" />}>
        What the calls bought
      </SectionTitle>
      <p className="mt-1 text-small text-ink/70">
        The sales that came off a call this month. What each offer is worth is the
        offer&rsquo;s own price — nothing to type twice. Work priced per job goes on the
        bespoke line, where both figures are yours to enter.
      </p>

      <form action={action} className="mt-4">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="here" value={here} />

        <ul className="flex flex-col gap-2">
          {offers.map((offer) => (
            <li
              key={offer.id}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-deep px-3 py-2.5"
            >
              <label htmlFor={`w-${offer.id}`} className="min-w-0 grow">
                <span className="block truncate text-body font-medium text-ink">
                  {offer.name}
                </span>
                <span className="text-caption text-ink/55">
                  {offer.price === null
                    ? "No price set"
                    : `${formatValue(offer.price, "currency", currency)} each`}
                </span>
              </label>
              <input
                id={`w-${offer.id}`}
                name={`w:${offer.id}`}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={typed[offer.id] ?? ""}
                onChange={(e) =>
                  setTyped((was) => ({ ...was, [offer.id]: e.target.value }))
                }
                aria-label={`Sales from calls, ${offer.name}`}
                className={`${field} max-w-28`}
              />
              <span
                aria-live="polite"
                className="w-28 text-right font-num text-body text-ink/70"
              >
                {valueOf(offer.id) === null
                  ? DASH
                  : formatValue(valueOf(offer.id), "currency", currency)}
              </span>
            </li>
          ))}

          {/* Last, always — it is not an offer competing with the others,
              and putting it among them would say it was. */}
          <li
            key={BESPOKE_ID}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-cream-deep px-3 py-2.5"
          >
            <label htmlFor="w-bespoke-sales" className="min-w-0 grow">
              <span className="block truncate text-body font-medium text-ink">
                {BESPOKE_LABEL}
              </span>
              <span className="text-caption text-ink/55">
                Priced per job, so enter what it was worth
              </span>
            </label>
            <input
              id="w-bespoke-sales"
              name="b:sales"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={typed["bespoke:sales"] ?? ""}
              onChange={(e) =>
                setTyped((was) => ({ ...was, "bespoke:sales": e.target.value }))
              }
              aria-label="Bespoke sales from calls"
              className={`${field} max-w-28`}
            />
            <input
              id="w-bespoke-value"
              name="b:value"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={typed["bespoke:value"] ?? ""}
              onChange={(e) =>
                setTyped((was) => ({ ...was, "bespoke:value": e.target.value }))
              }
              aria-label="Value of bespoke sales from calls"
              className={`${field} w-28`}
            />
          </li>
        </ul>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-ink/70">
            <span className="font-num text-ink">{formatValue(sold, "count")}</span>{" "}
            {sold === 1 ? "sale" : "sales"} off calls, worth{" "}
            <span className="font-num text-ink">
              {formatValue(total, "currency", currency)}
            </span>
            {unpriced > 0
              ? ` — ${unpriced === 1 ? "one offer has" : `${unpriced} offers have`} no price, so ${unpriced === 1 ? "it is" : "they are"} not in that total.`
              : "."}
            {unaccounted !== null && unaccounted !== 0 ? (
              <>
                {" "}
                {unaccounted > 0
                  ? `You entered ${formatValue(converted, "count")} calls converted, so ${formatValue(unaccounted, "count")} ${unaccounted === 1 ? "is" : "are"} still to itemise.`
                  : `That is more than the ${formatValue(converted, "count")} calls converted you entered above.`}
              </>
            ) : null}
          </p>
          <Save />
        </div>

        {!hasOffers ? (
          <p className="mt-3 text-small text-ink/55">
            Set an offer up on the Offers section and it will appear here, beside the
            bespoke line.
          </p>
        ) : null}
      </form>

      <p aria-live="polite" className="mt-2 text-small text-deep-red">
        {state?.error ?? ""}
      </p>
    </Card>
  );
}
