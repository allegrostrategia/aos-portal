import { Card, SectionTitle } from "@/components/ui/card";
import { formatValue } from "@/lib/reporting/format";
import { IconCircle } from "./icons";

/**
 * What this month's leads could be worth (Nina, 3 November).
 *
 * **Two lines, because one of them is a fantasy and the other is a
 * forecast**, and showing only the first would be the kind of number a
 * client quotes back at you. Leads multiplied by a price assumes every
 * lead buys; at a 20% conversion it is five times the real answer. So
 * the unweighted figure is here and labelled exactly as what it is, with
 * the weighted one under it. Nina can drop either later; this is the
 * pair as Dom approved it.
 *
 * **The multiplier is the lead-to-client rate, not the close rate.**
 * Dom's note said close rate, and close rate on this page means new
 * clients ÷ calls HELD — so multiplying leads by it is arithmetic about
 * two different populations: a client with few calls and a high close
 * rate would come out with more potential revenue than they have leads
 * to earn it from. Lead to client rate is new clients ÷ total leads,
 * which is the one that belongs against a lead count, and it is already
 * a figure on this page so the reader can see where the multiplier came
 * from. Said in the words under the figures rather than left to be
 * inferred.
 *
 * **The price is the chosen offer's own** (Dom, 4 November). The settings
 * screen picks which offer the leads are for; the number comes from
 * `report_entities.price`, which is the same number the Offers page
 * shows. A price typed twice is a price that drifts, and the drift shows
 * up on two screens that are meant to agree.
 *
 * Nothing renders without a price: no offer chosen, or an offer with no
 * price on it, means "do not show this", rather than £0.
 */
export function PotentialRevenue({
  price,
  offerName,
  leads,
  leadToClientRate,
  currency,
}: {
  /** The chosen offer's price — what one sale is worth. */
  price: number | null;
  /** Its name, so the figure says which offer it assumed. */
  offerName: string | null;
  leads: number | null;
  /** A percentage, as the page shows it: 12 means 12%. */
  leadToClientRate: number | null;
  currency: string;
}) {
  // A free offer multiplies every lead into nothing, which reads as a
  // bug rather than as a fact about the business. The old typed column
  // refused zero in the database; the price now belongs to the offer,
  // where zero is a legitimate thing to set, so the refusal lives here.
  if (price === null || price <= 0 || leads === null) return null;

  const ifEveryLeadBought = leads * price;
  const atTheirRate = leadToClientRate === null ? null : ifEveryLeadBought * (leadToClientRate / 100);
  const money = (figure: number) => formatValue(figure, "currency", currency);

  return (
    <Card className="mt-6">
      <SectionTitle icon={<IconCircle name="revenue" tone="gold" />}>
        What those leads could be worth
      </SectionTitle>

      <dl className="mt-1 flex flex-col gap-4 sm:flex-row sm:gap-10">
        <div>
          <dt className="text-small text-ink/70">If every lead bought</dt>
          <dd className="font-display mt-1 text-[1.75rem] leading-tight font-medium text-ink lining-nums">
            {money(ifEveryLeadBought)}
          </dd>
        </div>
        <div>
          <dt className="text-small text-ink/70">At your current lead to client rate</dt>
          <dd className="font-display mt-1 text-[1.75rem] leading-tight font-medium text-ink lining-nums">
            {atTheirRate === null ? "—" : money(atTheirRate)}
          </dd>
        </div>
      </dl>

      {/* **The price is on the page, not hidden behind the figure.**
          Nobody should have to trust a number they cannot see, and the
          first question anybody asks of a potential-revenue figure is
          what it was multiplied by. */}
      <p className="mt-4 text-caption text-ink/60">
        {leads} {leads === 1 ? "lead" : "leads"} at {money(price)} a sale
        {offerName ? ` (${offerName})` : ""}
        {leadToClientRate === null
          ? ", and no lead to client rate yet for the second figure."
          : `, and ${leadToClientRate.toFixed(1)}% of leads became clients.`}
      </p>
    </Card>
  );
}
