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
 * Nothing renders without a price: the price is typed on the settings
 * screen and blank means "do not show this", rather than £0.
 */
export function PotentialRevenue({
  price,
  leads,
  leadToClientRate,
  currency,
}: {
  /** `report_workspaces.potential_revenue_price` — what one sale is worth. */
  price: number | null;
  leads: number | null;
  /** A percentage, as the page shows it: 12 means 12%. */
  leadToClientRate: number | null;
  currency: string;
}) {
  if (price === null || leads === null) return null;

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
        {leadToClientRate === null
          ? ", and no lead to client rate yet for the second figure."
          : `, and ${leadToClientRate.toFixed(1)}% of leads became clients.`}
      </p>
    </Card>
  );
}
