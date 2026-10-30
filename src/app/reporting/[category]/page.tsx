import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KpiCard } from "@/components/reporting/kpi-card";
import { MonthBeingPrepared } from "@/components/reporting/month-holding";
import { StrategistNotes } from "@/components/reporting/notes";
import { PublishBadge, ReportShell } from "@/components/reporting/report-shell";
import { buttonClasses } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle, toneFor } from "@/components/reporting/icons";
import { CATEGORY_ICONS } from "@/components/reporting/report-shell";
import { FunnelChart } from "@/components/reporting/charts/funnel-chart";
import { STAGE_3, categoryBySlug } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import {
  CHANGE_TONE_CLASS,
  changeTone,
  formatChange,
  formatValue,
} from "@/lib/reporting/format";
import { getMonthFigures, offerBreakdown } from "@/lib/reporting/month-figures";
import { calculateFunnel } from "@/lib/reporting/calculate";
import { TopItemsReport } from "@/components/reporting/top-items";
import { getTargets, getTopItems } from "@/lib/reporting/queries";
import { getEntityHistory, getFigureHistory } from "@/lib/reporting/figure-history";
import { OfferCard } from "@/components/reporting/offer-card";
import { GroupedBarChart } from "@/components/reporting/charts/grouped-bar-chart";
import { monthLabel, monthsEndingAt, shortMonthLabel } from "@/lib/reporting/months";
import { metricIcon } from "@/lib/reporting/metric-icons";
import { TrendPanel } from "@/components/reporting/trend-panel";
import { TREND_CHARTS, trendMetricKeys, trendMonthsNeeded } from "@/lib/reporting/trends";
import { ads as adsFormulas, monthOnMonthChange } from "@/lib/reporting/formulas";
import { GOAL_LABELS } from "@/components/reporting/campaigns-entry";
import { BarChart } from "@/components/reporting/charts/bar-chart";
import { DonutChart } from "@/components/reporting/charts/donut-chart";
import {
  costBreakdown,
  hourlyRateByOffer,
  leadsBySource,
  revenueByOffer,
} from "@/lib/reporting/chart-data";

export const metadata: Metadata = {
  title: "Monthly Report — aOS",
};

/**
 * One category's report page, for any category.
 *
 * Generated from the metric list like the entry screen is, for the same
 * reason (§9). The mockup's per-category charts — the follower line, the
 * funnel graphic, the donut — are Stage 3's, alongside the traffic lights
 * they share their colour rules with.
 *
 * Offers gets a block of its own, because it is the one Stage 2 category
 * whose figures are per-row rather than per-month and a flat list of metrics
 * would say nothing about which offer earned what.
 */
export default async function CategoryReportPage({
  params,
  searchParams,
}: PageProps<"/reporting/[category]">) {
  const { category: slug } = await params;
  const search = await searchParams;

  const category = categoryBySlug(slug);
  if (!category || category.key === "overview") notFound();

  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  if (ctx.workspace.hidden_categories.includes(category.key)) notFound();

  const figures = await getMonthFigures(ctx);
  const topItems =
    category.key === "trial_reels"
      ? await getTopItems(ctx.workspace.id, ctx.month.month)
      : null;
  // On a published month, the month it was compared against comes from
  // the snapshot too. `ctx.month.previous` is the previous month the
  // VIEWER can see, and a client sees published ones only — so without
  // this, unpublishing July turns "vs. July" into "No month to compare"
  // on an August that still holds July's figures.
  const comparedWith = figures.carried?.previousMonth ?? ctx.month.previous;
  const previousLabel = comparedWith ? monthLabel(comparedWith).split(" ")[0] : null;

  const metrics = figures.metrics.filter((m) => m.category === category.key);
  const headline = metrics
    .filter((m) => m.input_type === "core" || m.input_type === "calc")
    .filter((m) => figures.figure(m.key) !== null)
    .slice(0, 6);
  const rest = metrics.filter(
    (m) => !headline.includes(m) && figures.figure(m.key) !== null,
  );

  /**
   * Twelve months behind this one, for the sparklines and this category's
   * trend charts.
   *
   * Stage 3, so the switch is asked before the database is — these pages
   * are ones a client already opens, and the promise Stage 3 made is that
   * pushing it changes nothing they see until `PRODUCTION_STAGE` moves.
   *
   * The span is the longest any one chart asks for, and the shorter charts
   * take the tail of it: one load rather than one per chart, and the six-
   * month chart beside the twelve-month one is then reading the same rows.
   *
   * Computed, not read: save rate and share rate are
   * `calc` — saves ÷ reach, shares ÷ reach — and have never had a row in
   * `report_values`, so reading them would have drawn an empty chart under
   * a confident title.
   */
  const trendSpecs = STAGE_3 ? (TREND_CHARTS[category.key] ?? []) : [];
  const historySpan = STAGE_3
    ? Math.max(12, trendMonthsNeeded(category.key))
    : 0;
  const historyMonths = STAGE_3 ? monthsEndingAt(ctx.month.month, historySpan) : [];
  const historyKeys = STAGE_3
    ? [...new Set([...headline.map((m) => m.key), ...trendMetricKeys(category.key)])]
    : [];
  const history = STAGE_3
    ? await getFigureHistory({
        workspaceId: ctx.workspace.id,
        months: historyMonths,
        metricKeys: historyKeys,
        metrics: figures.metrics,
      })
    : new Map<string, (number | null)[]>();
  const axis = historyMonths.map(shortMonthLabel);
  // Only a chart with a `targetFor` needs these, so a category with no
  // such chart does not spend the round trip.
  const chartTargets = trendSpecs.some((spec) => spec.targetFor)
    ? await getTargets(ctx.workspace.id, ctx.month.month)
    : new Map<string, number>();

  /**
   * Six months of revenue, one series per offer (the mockup's "Revenue by
   * offer", Phase 4).
   *
   * **This month's offers, in this month's order.** The donut, the hourly
   * rate bars and this chart all walk `offerBreakdown(figures)`, so the
   * nth offer wears the nth colour in all three and a reader can carry one
   * across the page. An offer that sold in April and not in September is
   * not on this page at all — the same rule the donut has always followed,
   * stated here because this chart is the one where it shows.
   *
   * `offers_revenue_this_month` is stored per offer, so this is a plain
   * query rather than `getFigureHistory`: there is nothing to work out.
   */
  const offerRows = category.key === "offers" ? offerBreakdown(figures) : [];
  const offerMonths = STAGE_3 ? historyMonths.slice(-6) : [];
  const offerHistory =
    offerRows.length > 0 && offerMonths.length > 0
      ? await getEntityHistory({
          workspaceId: ctx.workspace.id,
          months: offerMonths,
          metricKey: "offers_revenue_this_month",
          entityIds: offerRows.map(({ offer }) => offer.id),
        })
      : new Map<string, (number | null)[]>();

  const notes = figures.data.notes.filter(
    (n) => n.note_type === "strategist" && n.category === category.key,
  );
  const mine = notes.find((n) => n.author_id === ctx.reportUser.id) ?? null;

  // §4: "A category with no data for a month doesn't appear in that month's
  // report. No toggles needed." Here that means saying so plainly rather than
  // drawing a page of dashes.
  //
  // **A category whose figures hang off a row has none at month level.**
  // Counting only month-level figures called Offers empty on a month with
  // offers in it, whenever those offers produced no month-level total —
  // units sold entered but no revenue yet, say — and the page then said
  // "Nothing for August" directly above the table of offers it drew next.
  const entityRows =
    category.key === "offers"
      ? figures.offerRows.length
      : category.key === "ads"
        ? figures.campaignRows.filter((row) => row.spend !== null).length
        : category.key === "funnels"
          ? figures.funnelRows.filter(
              (row) => row.landingPageViews !== null || row.purchases !== null,
            ).length
          : 0;

  const empty = headline.length === 0 && rest.length === 0 && entityRows === 0;

  return (
    <ReportShell
      ctx={ctx}
      active={category.key}
      path={`/reporting/${category.slug}`}
      title={category.label}
      tagline={`${category.tagline} · ${ctx.month.label}`}
      actions={
        <>
          <PublishBadge
            kind={ctx.workspace.kind}
            publishedAt={figures.data.period?.published_at ?? null}
            show={ctx.showDraftState}
          />
          {ctx.canEdit && category.entry ? (
            <Link
              href={reportHref(`/reporting/enter/${category.slug}`, ctx)}
              className={buttonClasses("secondary", "sm")}
            >
              Enter data
            </Link>
          ) : null}
        </>
      }
    >
      {!ctx.monthPublished ? (
        // A month that is not out yet, reached by URL or by the picker's
        // own arrow since decision 10 put it there. Saying the section
        // "wasn't part of this month's report" would be a lie — it may be
        // full of figures that are simply not theirs yet. Same wording as
        // the Overview's, from the same component.
        <MonthBeingPrepared monthLabel={ctx.month.label} />
      ) : empty ? (
        <Card>
          <SectionTitle>Nothing for {ctx.month.label}</SectionTitle>
          <p className="text-body text-ink/70">
            {ctx.canEdit
              ? "No figures have been entered for this section yet."
              : "This section wasn't part of this month's report."}
          </p>
        </Card>
      ) : (
        <>
          {/* Four across where there are four — the Offers row, which the
              mockup draws as one line of four and which came out as three
              and a card on its own underneath. Written out rather than
              built from a variable, because Tailwind reads the class
              names out of the source. */}
          <div
            className={`grid gap-4 sm:grid-cols-2 ${
              headline.length === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {headline.map((metric, index) => (
              <KpiCard
                key={metric.key}
                label={metric.label}
                // One mark per METRIC, falling back to the category's
                // where a metric has none of its own (Dom, 30 October).
                // The first pass gave all six cards the category glyph;
                // the mockups give the Social Media row people, person-
                // plus, heart, bars and pointer, which is both the
                // approved drawing and the more useful one. The tint
                // still rotates by position, so a row reads as a set.
                icon={{
                  name: metricIcon(metric.key, CATEGORY_ICONS[category.key]),
                  tone: toneFor(index),
                }}
                value={figures.figure(metric.key)}
                previous={figures.previousFigure(metric.key)}
                unit={metric.unit}
                goodDirection={metric.good_direction}
                currency={ctx.workspace.currency}
                previousLabel={previousLabel}
                history={history.get(metric.key)}
              />
            ))}
          </div>

          {trendSpecs.length > 0 ? (
            // Three across where there are three, as the mockup draws
            // them, rather than two and a hole beside the third. Written
            // out because a Tailwind class cannot be built from a
            // variable at runtime.
            <div
              className={`mt-6 grid gap-6 ${
                trendSpecs.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
              }`}
            >
              {trendSpecs.map((spec) => (
                <TrendPanel
                  key={spec.id}
                  spec={spec}
                  history={history}
                  // The whole span; the panel takes the tail its own
                  // spec asks for, so the labels and the points can never
                  // be sliced apart.
                  months={axis}
                  currency={ctx.workspace.currency}
                  columns={trendSpecs.length >= 3 ? 3 : 2}
                  target={
                    spec.targetFor ? (chartTargets.get(`${spec.targetFor}|`) ?? null) : null
                  }
                />
              ))}
            </div>
          ) : null}

          {category.key === "leads_conversions" ? (
            <Card className="mt-6">
              <SectionTitle icon={<IconCircle name="chart" tone="sky" />} aside={ctx.month.label}>
                Where the leads came from
              </SectionTitle>
              <BarChart
                data={leadsBySource(figures)}
                caption="New leads this month, by source."
              />
            </Card>
          ) : null}

          {category.key === "offers" ? (
            <>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Card>
                  <SectionTitle icon={<IconCircle name="revenue" tone="gold" />} aside={ctx.month.label}>
                    Share of revenue
                  </SectionTitle>
                  <DonutChart
                    slices={revenueByOffer(figures, ctx.workspace.currency)}
                    total={figures.results.offers_total_revenue_from_offers ?? null}
                    totalDisplay={formatValue(
                      figures.results.offers_total_revenue_from_offers ?? null,
                      "currency",
                      ctx.workspace.currency,
                    )}
                    totalLabel="Total"
                    emptyMessage="No offer revenue entered for this month yet."
                  />
                </Card>
                <Card>
                  <SectionTitle aside="(revenue − other direct costs) ÷ hours">
                    Effective hourly rate
                  </SectionTitle>
                  <BarChart
                    data={hourlyRateByOffer(figures, ctx.workspace.currency)}
                    // The categories ARE the identities here, and the
                    // donut beside it is already using the same five
                    // hues for the same offers. Each bar carries its
                    // offer's index rather than its own, so the sort
                    // does not repaint them.
                    colourByCategory
                    target={ctx.workspace.target_hourly_rate}
                    targetLabel={
                      ctx.workspace.target_hourly_rate === null
                        ? undefined
                        : `Target ${formatValue(
                            ctx.workspace.target_hourly_rate,
                            "currency",
                            ctx.workspace.currency,
                          )} an hour`
                    }
                    caption="What an hour of each offer is actually worth. Labour cost is not deducted."
                  />
                </Card>
              </div>

              {/* **A card per offer, in place of the table** (Phase 4, the
                  approved mockup). Up to three across, which is what the
                  cards hold at — the mockup draws four at its own wider
                  page. Same figures, same `calculateOffer`; what changed
                  is that the margin is a ring the size of the thing being
                  judged rather than the fourth of six columns. */}
              <div
                className={`mt-6 grid gap-4 sm:grid-cols-2 ${
                  offerRows.length >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3"
                }`}
              >
                {offerRows.map(({ offer, results }, index) => (
                  <OfferCard
                    key={offer.id}
                    name={offer.name}
                    pricingModel={offer.pricingModel}
                    price={offer.price}
                    unitsSold={offer.unitsSold}
                    revenue={offer.revenue}
                    hoursSpent={offer.hoursSpent}
                    margin={results.offers_margin}
                    hourlyRate={results.offers_effective_hourly_rate}
                    targetHourlyRate={ctx.workspace.target_hourly_rate}
                    currency={ctx.workspace.currency}
                    tone={toneFor(index)}
                  />
                ))}
              </div>

              {STAGE_3 && offerRows.length > 0 ? (
                <Card className="mt-6">
                  <SectionTitle
                    icon={<IconCircle name="revenue" tone="orange" />}
                    aside="Last 6 months"
                  >
                    Revenue by offer
                  </SectionTitle>
                  {/* Grouped bars, not lines. Lines would need one legible
                      ink per offer and there are three (see
                      `charts/palette.ts`); a bar is a fill, so the
                      five-hue palette applies and each offer keeps the
                      colour it has in the donut above. */}
                  <GroupedBarChart
                    series={offerRows.map(({ offer }) => ({
                      label: offer.name,
                      points:
                        offerHistory.get(offer.id) ?? offerMonths.map(() => null),
                    }))}
                    months={offerMonths.map(shortMonthLabel)}
                    unit="currency"
                    currency={ctx.workspace.currency}
                    colours="entities"
                    caption="What each offer earned, month by month. A month with nothing entered leaves a space."
                    emptyMessage="Two months of figures are needed before there is a comparison to draw."
                  />
                </Card>
              ) : null}
            </>
          ) : null}

          {category.key === "ads" ? <CampaignTable ctx={ctx} figures={figures} /> : null}

          {category.key === "funnels" ? <FunnelTable ctx={ctx} figures={figures} /> : null}

          {topItems ? (
            <TopItemsReport thisMonth={topItems.thisMonth} history={topItems.history} />
          ) : null}

          {category.key === "financials" ? (
            <Card className="mt-6">
              <SectionTitle icon={<IconCircle name="calculator" tone="blush" />} aside={ctx.month.label}>
                Where the money went
              </SectionTitle>
              <DonutChart
                slices={costBreakdown(figures, ctx.workspace.currency)}
                total={figures.results.financials_total_costs ?? null}
                totalDisplay={formatValue(
                  figures.results.financials_total_costs ?? null,
                  "currency",
                  ctx.workspace.currency,
                )}
                totalLabel="Total costs"
                emptyMessage="No costs entered for this month yet."
              />
            </Card>
          ) : null}

          {rest.length > 0 ? (
            <Card className="mt-6">
              {/* **Nina, 29 October: these carry their direction too.** It
                  was the one gap of the four where a previous figure
                  existed and simply was not drawn, so it was a choice
                  rather than a fact.

                  The month compared against is said once, in the aside,
                  rather than "vs. August" on each of a dozen rows. */}
              <SectionTitle aside={previousLabel ? `vs. ${previousLabel}` : undefined}>
                Everything else this month
              </SectionTitle>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((metric) => {
                  const change = monthOnMonthChange(
                    figures.figure(metric.key),
                    figures.previousFigure(metric.key),
                  );
                  const changeText = formatChange(change);
                  // The same tone map the cards use, from the same place,
                  // so a figure cannot be green here and red there.
                  const tone = changeTone(change, metric.good_direction);

                  return (
                    <div
                      key={metric.key}
                      className="flex items-baseline justify-between gap-4 border-b border-ink/8 pb-3"
                    >
                      <dt className="text-small text-ink/70">{metric.label}</dt>
                      <dd className="text-right">
                        <span className="block font-mono text-body text-ink">
                          {formatValue(
                            figures.figure(metric.key),
                            metric.unit,
                            ctx.workspace.currency,
                          )}
                        </span>
                        {changeText && previousLabel ? (
                          <span
                            className={`block text-caption font-medium ${
                              CHANGE_TONE_CLASS[tone ?? "neutral"]
                            }`}
                          >
                            {changeText}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          ) : null}
        </>
      )}

      <div className="mt-6">
        <StrategistNotes
          notes={notes}
          canWrite={ctx.canEdit && ctx.workspace.kind === "retainer"}
          workspaceId={ctx.workspace.id}
          month={ctx.month.month}
          category={category.key}
          mine={mine}
          emptyMessage="No note on this section this month."
        />
      </div>
    </ReportShell>
  );
}

/**
 * Each campaign this month, and the totals under them (§5.7).
 *
 * The totals row is the point of the table as much as the rows are: spend
 * and leads are sums, and **cost per lead is not** — it counts lead and
 * sales campaigns only, so a reader who divides the two columns in their
 * head gets a different number. The footnote says which, rather than
 * leaving somebody to wonder whether the arithmetic is broken.
 *
 * Reach is shown per campaign and deliberately not summed (§10.2: the same
 * overlap problem as post reach — one person seeing three campaigns is
 * three rows and one human being).
 */
function CampaignTable({
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
                <td className="px-3 py-3 text-right font-mono text-body text-ink">
                  {formatValue(row.spend ?? null, "currency", currency)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-body text-ink">
                  {formatValue(row.linkClicks ?? null, "count")}
                </td>
                <td className="px-3 py-3 text-right font-mono text-body text-ink">
                  {formatValue(row.leads ?? null, "count")}
                </td>
                <td className="px-5 py-3 text-right font-mono text-body text-ink sm:px-6">
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
              <td className="px-3 py-3 text-right font-mono text-body text-ink">
                {formatValue(totals.spend ?? null, "currency", currency)}
              </td>
              <td className="px-3 py-3 text-right font-mono text-body text-ink">
                {formatValue(totals.linkClicks ?? null, "count")}
              </td>
              <td className="px-3 py-3 text-right font-mono text-body text-ink">
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
function FunnelTable({
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
                  <td className="px-3 py-3 text-right font-mono text-body text-ink">
                    {formatValue(row.landingPageViews ?? null, "count")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-body text-ink">
                    {formatValue(results.funnels_opt_in_rate ?? null, "percent")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-body text-ink">
                    {formatValue(row.purchases ?? null, "count")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-body text-ink">
                    {formatValue(row.priceAtMonth ?? null, "currency", currency)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-body text-ink sm:px-6">
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
