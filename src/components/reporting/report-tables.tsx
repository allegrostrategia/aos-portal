import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "@/components/reporting/icons";
import { DASH, formatValue } from "@/lib/reporting/format";
import { ads as adsFormulas } from "@/lib/reporting/formulas";
import { calculateFunnel } from "@/lib/reporting/calculate";
import { callWinRows, callWinTotals } from "@/lib/reporting/call-wins";
import { FunnelChart } from "@/components/reporting/charts/funnel-chart";
import { BarChart } from "@/components/reporting/charts/bar-chart";
import { winsByOffer } from "@/lib/reporting/chart-data";
import { GOAL_LABELS } from "@/components/reporting/campaigns-entry";
import type { resolveReportContext } from "@/lib/reporting/context";
import type { getMonthFigures } from "@/lib/reporting/month-figures";

/**
 * The tables whose rows are entities rather than months.
 *
 * **Lifted out of the category page on 14 November** so the printed
 * report can draw them too. A client's PDF has to hold what their
 * report pages hold, and these were the two biggest things it did not
 * — a month of ads with no campaign table is a page of averages.
 *
 * Presentational and pure: both take the context and the month's
 * figures and work nothing out that `calculate()` has not already.
 */

export function CampaignTable({
  ctx,
  figures,
}: {
  ctx: Awaited<ReturnType<typeof resolveReportContext>>;
  figures: Awaited<ReturnType<typeof getMonthFigures>>;
}) {
  const rows = figures.campaignRows;
  if (rows.length === 0) return null;

  const currency = ctx.workspace.currency;
  const totals = adsFormulas.totals(rows);
  const unset = rows.filter((row) => row.goal === null);

  return (
    <Card className="mt-6" padded={false}>
      <div className="p-5 sm:p-6">
        <SectionTitle icon={<IconCircle name="ads" tone="orange" />}>
          Each campaign this month
        </SectionTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left">
          <thead>
            <tr className="border-y border-ink/8 text-caption text-ink/55 uppercase">
              <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Campaign</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Goal</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Spend</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Clicks</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Leads</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Reach</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-ink/8 last:border-0">
                <th scope="row" className="px-5 py-3 text-body font-medium text-ink sm:px-6">
                  {row.name}
                </th>
                <td className="px-3 py-3 text-small text-ink/70">
                  {row.goal ? GOAL_LABELS[row.goal] : <span className="text-ink/45">Not set</span>}
                </td>
                <td className="px-3 py-3 text-right font-num text-body text-ink">
                  {formatValue(row.spend ?? null, "currency", currency)}
                </td>
                <td className="px-3 py-3 text-right font-num text-body text-ink">
                  {formatValue(row.linkClicks ?? null, "count")}
                </td>
                <td className="px-3 py-3 text-right font-num text-body text-ink">
                  {formatValue(row.leads ?? null, "count")}
                </td>
                <td className="px-5 py-3 text-right font-num text-body text-ink sm:px-6">
                  {formatValue(figures.data.values.get("ads_reach", row.id), "count")}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink/15">
              <th scope="row" className="px-5 py-3 text-body font-medium text-ink sm:px-6">
                Total
              </th>
              <td />
              <td className="px-3 py-3 text-right font-num text-body text-ink">
                {formatValue(totals.spend ?? null, "currency", currency)}
              </td>
              <td className="px-3 py-3 text-right font-num text-body text-ink">
                {formatValue(totals.linkClicks ?? null, "count")}
              </td>
              <td className="px-3 py-3 text-right font-num text-body text-ink">
                {formatValue(totals.leads ?? null, "count")}
              </td>
              <td className="px-5 py-3 text-right text-caption text-ink/45 sm:px-6">
                not summed
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-5 pb-5 text-caption text-ink/55 sm:px-6">
        Cost per lead counts lead and sales campaigns only, so it is not total spend
        divided by total leads.
        {unset.length > 0
          ? ` ${unset.length === 1 ? "One campaign has" : `${unset.length} campaigns have`} no goal set and ${unset.length === 1 ? "is" : "are"} not counted in it.`
          : ""}
        {" "}Reach is shown per campaign and not added up: the same person can be reached
        by more than one.
      </p>
    </Card>
  );
}

/**
 * Each funnel this month (§5.5).
 *
 * The price column is the one a reader might not expect: it is the
 * offer's price **as it was when this month was saved**, not as it is
 * now, so revenue here cannot move after the client has read it. A funnel
 * with no linked offer shows a dash for revenue rather than £0 — it did
 * not earn nothing, we have no price to work it out with.
 */
export function FunnelTable({
  ctx,
  figures,
}: {
  ctx: Awaited<ReturnType<typeof resolveReportContext>>;
  figures: Awaited<ReturnType<typeof getMonthFigures>>;
}) {
  const rows = figures.funnelRows;
  if (rows.length === 0) return null;

  const currency = ctx.workspace.currency;

  return (
    <Card className="mt-6" padded={false}>
      <div className="p-5 sm:p-6">
        <SectionTitle icon={<IconCircle name="funnels" tone="sky" />}>
          Each funnel this month
        </SectionTitle>
      </div>
      {/* The mockups' graphic, above the table rather than instead of it:
          the shape says where people fall out, the table says by how much.
          Each funnel gets its own, because two funnels on one chart would
          be two different populations drawn as one. */}
      <div className="grid gap-6 px-5 pb-6 sm:px-6 lg:grid-cols-2">
        {rows.map((row) => {
          const results = calculateFunnel(row);
          // Derived rather than stored: the opt-in count is the rate
          // applied to the views, which is how §5.5 defines it.
          const views = row.landingPageViews ?? null;
          const optIns =
            views !== null && results.funnels_opt_in_rate != null
              ? Math.round((views * results.funnels_opt_in_rate) / 100)
              : null;

          return (
            <div key={`funnel-${row.id}`}>
              <h3 className="mb-3 text-small font-medium text-ink">{row.name}</h3>
              <FunnelChart
                stages={[
                  { label: "Saw the page", value: views },
                  { label: "Opted in", value: optIns },
                  { label: "Bought", value: row.purchases ?? null },
                ]}
              />
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left">
          <thead>
            <tr className="border-y border-ink/8 text-caption text-ink/55 uppercase">
              <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Funnel</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Visitors</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Opt-in rate</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Purchases</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Price</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const results = calculateFunnel(row);
              return (
                <tr key={row.id} className="border-b border-ink/8 last:border-0">
                  <th scope="row" className="px-5 py-3 text-body font-medium text-ink sm:px-6">
                    {row.name}
                  </th>
                  <td className="px-3 py-3 text-right font-num text-body text-ink">
                    {formatValue(row.landingPageViews ?? null, "count")}
                  </td>
                  <td className="px-3 py-3 text-right font-num text-body text-ink">
                    {formatValue(results.funnels_opt_in_rate ?? null, "percent")}
                  </td>
                  <td className="px-3 py-3 text-right font-num text-body text-ink">
                    {formatValue(row.purchases ?? null, "count")}
                  </td>
                  <td className="px-3 py-3 text-right font-num text-body text-ink">
                    {formatValue(row.priceAtMonth ?? null, "currency", currency)}
                  </td>
                  <td className="px-5 py-3 text-right font-num text-body text-ink sm:px-6">
                    {formatValue(results.funnels_funnel_revenue ?? null, "currency", currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 pb-5 text-caption text-ink/55 sm:px-6">
        The price is the one this funnel&rsquo;s offer was selling at when the month was
        put together, so this month&rsquo;s revenue does not change if the price does.
      </p>
    </Card>
  );
}

/**
 * What the calls bought, line by line (§5.6).
 *
 * Nina, 16 November: "what they bought (by offer, with revenue)". The bars
 * rank the month by value; the table says how many and at what price, which
 * is the part a ranking cannot carry.
 *
 * **Nothing is worked out here.** The rows are `callWinRows`, the same
 * function the entry screen's running total uses, so the breakdown and the
 * figure somebody typed against cannot drift apart.
 *
 * Every offer with a figure against it, including ones since retired: an
 * offer taken off sale in November still sold in June, and rule 7 says June
 * keeps it. Plus the bespoke line, last, for work priced per job.
 */
export function CallWinsTable({
  ctx,
  figures,
}: {
  ctx: Awaited<ReturnType<typeof resolveReportContext>>;
  figures: Awaited<ReturnType<typeof getMonthFigures>>;
}) {
  const rows = callWinRows(figures.callWins, figures.bespokeWins);
  if (rows.length === 0) return null;

  const currency = ctx.workspace.currency;
  const { sales, value, unpriced } = callWinTotals(rows);

  /**
   * **What the funnel said closed, beside what the breakdown accounts
   * for.** They are allowed to differ — a call can close something
   * nobody has itemised — but a reader who totals the rows and gets a
   * different number from the step above deserves the sentence rather
   * than the puzzle.
   */
  const converted = figures.figure("leads_conversions_calls_converted");
  const unaccounted = converted === null ? null : converted - sales;

  return (
    <Card className="mt-6" padded={false}>
      <div className="p-5 sm:p-6">
        <SectionTitle
          icon={<IconCircle name="offers" tone="gold" />}
          aside={formatValue(value, "currency", currency)}
        >
          What the calls bought
        </SectionTitle>
        <div className="mt-4">
          <BarChart
            data={winsByOffer(figures, currency)}
            colourByCategory
            caption="What each line was worth this month, from sales that came off a call."
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left">
          <thead>
            <tr className="border-y border-ink/8 text-caption text-ink/55 uppercase">
              <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">What they bought</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Sales</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Price</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-ink/8 last:border-0">
                <th scope="row" className="px-5 py-3 text-body font-medium text-ink sm:px-6">
                  {row.name}
                </th>
                <td className="px-3 py-3 text-right font-num text-body text-ink">
                  {formatValue(row.sales, "count")}
                </td>
                <td className="px-3 py-3 text-right font-num text-body text-ink">
                  {/* The bespoke line has no price by definition: it is
                      work priced per job, which is why its value is typed
                      rather than multiplied out. A dash, never £0. */}
                  {row.bespoke ? DASH : formatValue(row.price, "currency", currency)}
                </td>
                <td className="px-5 py-3 text-right font-num text-body text-ink sm:px-6">
                  {formatValue(row.value, "currency", currency)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-ink/12 bg-cream-deep/40">
              <th scope="row" className="px-5 py-3 text-body font-medium text-ink sm:px-6">
                From calls this month
              </th>
              <td className="px-3 py-3 text-right font-num text-body text-ink">
                {formatValue(sales, "count")}
              </td>
              <td className="px-3 py-3" />
              <td className="px-5 py-3 text-right font-num text-body text-ink sm:px-6">
                {formatValue(value, "currency", currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="px-5 pb-5 text-caption text-ink/55 sm:px-6">
        Value is the sales times the offer&rsquo;s price, so a payment plan counts at
        what was won rather than what came in — the Financials section is the one
        that shows money received.
        {unpriced > 0
          ? ` ${unpriced === 1 ? "One offer has" : `${unpriced} offers have`} no price set, so ${unpriced === 1 ? "it is" : "they are"} not in the total.`
          : ""}
        {unaccounted !== null && unaccounted > 0
          ? ` ${unaccounted === 1 ? "One call" : `${unaccounted} calls`} closed this month ${unaccounted === 1 ? "is" : "are"} not itemised above.`
          : ""}
      </p>
    </Card>
  );
}
