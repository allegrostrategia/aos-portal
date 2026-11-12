import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DonutChart } from "@/components/reporting/charts/donut-chart";
import { BarChart } from "@/components/reporting/charts/bar-chart";
import { GroupedBarChart } from "@/components/reporting/charts/grouped-bar-chart";
import { toneFor } from "@/components/reporting/icons";
import { CampaignTable, FunnelTable } from "@/components/reporting/report-tables";
import { TopItemsReport } from "@/components/reporting/top-items";
import { TopPostsReport } from "@/components/reporting/top-posts";
import { TrendPanel } from "@/components/reporting/trend-panel";
import { OfferCard } from "@/components/reporting/offer-card";
import { PotentialRevenue } from "@/components/reporting/potential-revenue";
import {
  costBreakdown,
  forecastAhead,
  hourlyRateByOffer,
  leadsBySource,
  revenueByOffer,
} from "@/lib/reporting/chart-data";
import { ENTRY_CATEGORIES, STAGE_3, STAGE_4 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { getEntityHistory, getFigureHistory } from "@/lib/reporting/figure-history";
import { formatChange, formatValue } from "@/lib/reporting/format";
import { monthOnMonthChange } from "@/lib/reporting/formulas";
import { FOCUS_TAG, PANELS } from "@/lib/reporting/highlights";
import { launchRange } from "@/lib/reporting/launch-dates";
import { launchSummary } from "@/lib/reporting/launch-figures";
import { getLaunch, getLaunches } from "@/lib/reporting/launch-queries";
import { monthsEndingAt, shortMonthLabel } from "@/lib/reporting/months";
import { getMonthFigures, offerBreakdown } from "@/lib/reporting/month-figures";
import { overviewPanels } from "@/lib/reporting/overview-panels";
import { getTargets, getTopItems } from "@/lib/reporting/queries";
import { getTopPosts } from "@/lib/reporting/top-post-queries";
import {
  DRAWN_ELSEWHERE,
  HEADLINE_METRICS,
  TREND_CHARTS,
  trendMetricKeys,
  trendMonthsNeeded,
} from "@/lib/reporting/trends";

export const metadata: Metadata = { title: "Report · aOS" };

/**
 * The whole month, as a document.
 *
 * **Browser print-to-PDF, the same answer the SOP export gave** (§11,
 * and `/stations/archivio/[id]/print`): no dependency, no server
 * rendering, no font embedding, it works on a phone through the share
 * sheet, and what comes out is a real PDF the client owns.
 *
 * **It holds what their report pages hold** (Dom, 14 November). The
 * first version was figures and notes only, and a month of ads without
 * its campaign table is a page of averages — so the tables are tables,
 * the charts are the same SVG the screens draw, and the panels are the
 * same components fed from the same `getMonthFigures`. Nothing here
 * works a figure out for itself.
 *
 * What it leaves out is everything that is a control rather than
 * content: the save buttons, the reply box, "still to fill in", the
 * CSV link. A PDF of a form is not a report.
 */
export default async function ReportPrintPage({
  searchParams,
}: PageProps<"/reporting/print">) {
  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  // A month they cannot read is not a month they can print.
  if (!ctx.monthPublished && !ctx.canEdit) {
    redirect(reportHref("/reporting", ctx));
  }

  const figures = await getMonthFigures(ctx);
  const money = (v: number | null) => formatValue(v, "currency", ctx.workspace.currency);

  const visible = ENTRY_CATEGORIES.filter(
    (category) => !ctx.workspace.hidden_categories.includes(category.key),
  );

  /**
   * Everything the sections need, in as few round trips as the pages
   * themselves make — one history call for every chart on the document
   * rather than one per section.
   */
  const span = Math.max(12, ...visible.map((c) => trendMonthsNeeded(c.key)));
  const historyMonths = STAGE_3 ? monthsEndingAt(ctx.month.month, span) : [];
  const historyKeys = STAGE_3
    ? [...new Set(visible.flatMap((c) => trendMetricKeys(c.key)))]
    : [];

  const offerRows = offerBreakdown(figures);
  const offerMonths = STAGE_3 ? historyMonths.slice(-6) : [];

  const [targets, history, offerHistory, topPosts, topItems, launches] = await Promise.all([
    getTargets(ctx.workspace.id, ctx.month.month),
    historyKeys.length > 0
      ? getFigureHistory({
          workspaceId: ctx.workspace.id,
          months: historyMonths,
          metricKeys: historyKeys,
          metrics: figures.metrics,
        })
      : Promise.resolve(new Map<string, (number | null)[]>()),
    offerRows.length > 0 && offerMonths.length > 0
      ? getEntityHistory({
          workspaceId: ctx.workspace.id,
          months: offerMonths,
          metricKey: "offers_revenue_this_month",
          entityIds: offerRows.map(({ offer }) => offer.id),
        })
      : Promise.resolve(new Map<string, (number | null)[]>()),
    figures.platform
      ? getTopPosts(ctx.workspace.id, ctx.month.month, figures.platform.id)
      : Promise.resolve([]),
    getTopItems(ctx.workspace.id, ctx.month.month),
    STAGE_4 ? getLaunches(ctx.workspace.id) : Promise.resolve([]),
  ]);

  const axis = historyMonths.map(shortMonthLabel);
  const panels = overviewPanels({ ctx, figures, targets });

  // The launches that were live in this month, which is what decision
  // 14 puts on the monthly report.
  const launchCards = (
    await Promise.all(
      launches.map(async (launch) => {
        const detail = await getLaunch(launch.id);
        if (!detail) return null;
        return { launch, summary: launchSummary(detail), stages: detail.stages };
      }),
    )
  ).filter((card): card is NonNullable<typeof card> => card !== null);

  const notesFor = (category: string | null) =>
    figures.data.notes.filter(
      (n) => n.note_type === "strategist" && (n.category ?? null) === category,
    );
  const objectives = figures.data.notes.filter((n) => n.note_type === "objective");
  const reflection = figures.data.notes.find((n) => n.note_type === "reflection" && !n.category);

  const sections = visible
    .map((category) => {
      const metrics = figures.metrics.filter((m) => m.category === category.key);
      const named = HEADLINE_METRICS[category.key];
      const drawn = DRAWN_ELSEWHERE[category.key] ?? [];
      const shown = (named
        ? named
            .map((key) => metrics.find((m) => m.key === key))
            .filter((m): m is NonNullable<typeof m> => !!m)
        : metrics.filter((m) => ["core", "calc", "pulled"].includes(m.input_type))
      ).filter((m) => figures.figure(m.key) !== null);

      const rest = metrics.filter(
        (m) => !shown.includes(m) && !drawn.includes(m.key) && figures.figure(m.key) !== null,
      );

      return { category, figuresShown: [...shown, ...rest], notes: notesFor(category.key) };
    })
    // §4: a category with no data for a month does not appear in that
    // month's report, and a page of headings with nothing under them is
    // the printed version of the same mistake. A section with a table
    // but no month-level figures — Offers, Funnels, Ads — stays.
    .filter(
      (s) =>
        s.figuresShown.length > 0 ||
        s.notes.length > 0 ||
        (s.category.key === "offers" && offerRows.length > 0) ||
        (s.category.key === "funnels" && figures.funnelRows.length > 0) ||
        (s.category.key === "ads" && figures.campaignRows.length > 0) ||
        (s.category.key === "trial_reels" && topItems.thisMonth.length > 0) ||
        (s.category.key === "social_media" && topPosts.length > 0),
    );

  const leads = ctx.workspace.hidden_categories.includes("leads_conversions")
    ? []
    : leadsBySource(figures);

  return (
    <main className="mx-auto w-full max-w-[52rem] bg-white px-8 py-10 text-ink print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { margin: 16mm; }
          /* The reporting surface is a pale blue ground, which is right
             on a screen and is a grey wash on paper. */
          html, body { background: #fff; }
          .no-print { display: none !important; }
          /* A figure split from its own heading is the one thing that
             makes a printed report hard to read. */
          section, .keep-together { break-inside: avoid; }
          h2 { break-after: avoid; }
        }
      `}</style>

      <div className="no-print mb-8 rounded-lg border border-ink/15 bg-lemon/25 px-4 py-3">
        <p className="text-small text-ink/80">
          Print this page and choose <strong className="font-medium">Save as PDF</strong> as
          the destination. On a phone, use Share then Print.
        </p>
      </div>

      <header className="mb-8 border-b border-ink/20 pb-5">
        <p className="font-mono text-eyebrow uppercase text-ink/50">
          {ctx.workspace.business_name}
        </p>
        <h1 className="font-display mt-2 text-title font-medium text-ink">
          {ctx.month.label}
        </h1>
        {/* **The month's real state, not the viewer's access to it.**
            `monthPublished` is true for anybody who may read the month,
            editors included — so using it here printed "as published"
            across the top of a draft Nina was checking. */}
        <p className="mt-2 text-small text-ink/70">
          {figures.data.period?.published_at
            ? "Your month, as published."
            : "Draft — this month has not been published yet."}
        </p>
      </header>

      {/* --- the Overview's own panels ------------------------------- */}
      {panels.attention.length > 0 || panels.wins.length > 0 ? (
        <section className="mb-9 grid gap-6 sm:grid-cols-2">
          {panels.attention.length > 0 ? (
            <div className="keep-together">
              <h2 className="font-display text-heading font-medium text-ink">
                {PANELS.attention}
              </h2>
              <p className="mt-1 font-mono text-eyebrow uppercase text-ink/50">{FOCUS_TAG}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {panels.attention.map((item) => (
                  <li key={item.key} className="text-body text-ink/85">
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {panels.wins.length > 0 ? (
            <div className="keep-together">
              <h2 className="font-display text-heading font-medium text-ink">{PANELS.wins}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {panels.wins.map((item) => (
                  <li key={item.key} className="text-body text-ink/85">
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {leads.length > 0 ? (
        <section className="keep-together mb-9">
          <h2 className="font-display text-heading font-medium text-ink">
            Where the leads came from
          </h2>
          <div className="mt-3">
            <BarChart data={leads} colourByCategory caption="New leads this month, by source." />
          </div>
        </section>
      ) : null}

      {/* --- every section ------------------------------------------- */}
      {sections.map(({ category, figuresShown, notes }) => (
        <section key={category.key} className="mb-9">
          <h2 className="font-display text-heading font-medium text-ink">{category.label}</h2>

          {figuresShown.length > 0 ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
              {figuresShown.map((metric) => {
                const change = monthOnMonthChange(
                  figures.figure(metric.key),
                  figures.previousFigure(metric.key),
                );
                const changeText = formatChange(change);
                return (
                  <div
                    key={metric.key}
                    className="keep-together flex items-baseline justify-between gap-3 border-b border-ink/10 pb-2"
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
                      {changeText ? (
                        <span className="block font-mono text-caption text-ink/55">
                          {changeText}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : null}

          {/* The month's own arithmetic and the month's own rows. Each
              is the same component the screen draws, fed the same
              figures — a second implementation would be a second
              answer (§9). */}
          {category.key === "offers" && offerRows.length > 0 ? (
            <div className="keep-together mt-5">
              <h3 className="mb-2 font-mono text-eyebrow uppercase text-ink/50">
                Where the money came from
              </h3>
              <DonutChart
                slices={revenueByOffer(figures, ctx.workspace.currency, ctx.month.month)}
                total={figures.results.financials_total_revenue ?? null}
                totalDisplay={money(figures.results.financials_total_revenue ?? null)}
                totalLabel="Total revenue"
                emptyMessage="No money entered for this month."
              />
            </div>
          ) : null}

          {category.key === "offers" && ctx.workspace.track_offer_hours ? (
            <div className="keep-together mt-5">
              <h3 className="mb-2 font-mono text-eyebrow uppercase text-ink/50">
                Effective hourly rate
              </h3>
              <BarChart
                data={hourlyRateByOffer(figures, ctx.workspace.currency)}
                target={ctx.workspace.target_hourly_rate}
                targetLabel={`Target ${money(ctx.workspace.target_hourly_rate)} an hour`}
                caption="What an hour of each offer is actually worth. Labour cost is not deducted."
              />
            </div>
          ) : null}

          {category.key === "offers" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                  trackHours={ctx.workspace.track_offer_hours}
                  targetHourlyRate={ctx.workspace.target_hourly_rate}
                  currency={ctx.workspace.currency}
                  tone={toneFor(index)}
                />
              ))}
            </div>
          ) : null}

          {category.key === "offers" && offerHistory.size > 0 ? (
            <div className="keep-together mt-5">
              <h3 className="mb-2 font-mono text-eyebrow uppercase text-ink/50">
                Revenue by offer
              </h3>
              <GroupedBarChart
                series={offerRows.map(({ offer }) => ({
                  label: offer.name,
                  points: offerHistory.get(offer.id) ?? offerMonths.map(() => null),
                }))}
                months={offerMonths.map(shortMonthLabel)}
                unit="currency"
                currency={ctx.workspace.currency}
                colours="entities"
                caption="What each offer earned, month by month."
                emptyMessage="No revenue entered for these months yet."
              />
            </div>
          ) : null}

          {category.key === "ads" ? <CampaignTable ctx={ctx} figures={figures} /> : null}
          {category.key === "funnels" ? <FunnelTable ctx={ctx} figures={figures} /> : null}

          {category.key === "leads_conversions"
            ? (() => {
                const offer =
                  figures.data.entities.find(
                    (e) => e.id === ctx.workspace.potential_revenue_offer_id,
                  ) ?? null;
                return (
                  <div className="keep-together mt-5">
                    <PotentialRevenue
                      price={offer?.price ?? null}
                      offerName={offer?.name ?? null}
                      leads={figures.figure("leads_conversions_total_leads")}
                      leadToClientRate={figures.figure("leads_conversions_lead_to_client_rate")}
                      currency={ctx.workspace.currency}
                    />
                  </div>
                );
              })()
            : null}

          {category.key === "social_media" && topPosts.length > 0 && figures.platform ? (
            <div className="keep-together mt-5">
              <TopPostsReport
                posts={topPosts}
                platformName={figures.platform.name}
                showPlatform={figures.platforms.length > 1}
              />
            </div>
          ) : null}

          {category.key === "trial_reels" && topItems.thisMonth.length > 0 ? (
            <div className="keep-together mt-5">
              <TopItemsReport thisMonth={topItems.thisMonth} history={topItems.history} />
            </div>
          ) : null}

          {category.key === "financials" ? (
            <>
              {(() => {
                const ahead = forecastAhead(figures, ctx.month.month, ctx.workspace.currency);
                if (ahead.length === 0) return null;
                return (
                  <div className="keep-together mt-5">
                    <h3 className="mb-2 font-mono text-eyebrow uppercase text-ink/50">
                      Still expected this year
                    </h3>
                    <BarChart data={ahead} caption="What the forecast says for the months after this one." />
                  </div>
                );
              })()}
              {costBreakdown(figures, ctx.workspace.currency).length > 0 ? (
                <div className="keep-together mt-5">
                  <h3 className="mb-2 font-mono text-eyebrow uppercase text-ink/50">
                    Where the money went
                  </h3>
                  <DonutChart
                    slices={costBreakdown(figures, ctx.workspace.currency)}
                    total={figures.results.financials_total_costs ?? null}
                    totalDisplay={money(figures.results.financials_total_costs ?? null)}
                    totalLabel="Total costs"
                    emptyMessage="No costs entered for this month."
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {/* The section's own trend charts, the same specs the screen
              reads from. */}
          {(TREND_CHARTS[category.key] ?? []).map((spec) => (
            <div key={spec.id} className="keep-together mt-5">
              <TrendPanel
                spec={spec}
                history={history}
                months={axis}
                currency={ctx.workspace.currency}
                target={spec.targetFor ? (targets.get(`${spec.targetFor}|`) ?? null) : null}
              />
            </div>
          ))}

          {notes.map((note) => (
            <div key={note.id} className="keep-together mt-5 border-l-2 border-gold pl-4">
              <p className="font-mono text-eyebrow uppercase text-ink/50">
                Note from your Allegro team
              </p>
              <p className="mt-1 whitespace-pre-wrap text-body text-ink/85">{note.body}</p>
            </div>
          ))}
        </section>
      ))}

      {/* --- launches ------------------------------------------------- */}
      {launchCards.length > 0 ? (
        <section className="mb-9">
          <h2 className="font-display text-heading font-medium text-ink">Launches</h2>
          <div className="mt-3 flex flex-col gap-4">
            {launchCards.map(({ launch, summary, stages }) => (
              <div
                key={launch.id}
                className="keep-together border-b border-ink/10 pb-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-display text-body font-medium text-ink">{launch.name}</h3>
                  <p className="font-mono text-caption text-ink/55">
                    {launchRange(stages) ?? "No dates set"}
                  </p>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
                  {[
                    ["Sales", summary.totalSales, "count"],
                    ["Revenue", summary.totalRevenue, "currency"],
                    ["Average order", summary.averageOrderValue, "currency"],
                    ["Conversion", summary.conversionRate, "percent"],
                  ].map(([label, value, unit]) => (
                    <div key={String(label)}>
                      <dt className="text-caption text-ink/60">{String(label)}</dt>
                      <dd className="font-mono text-small text-ink">
                        {formatValue(
                          value as number | null,
                          unit as "count" | "currency" | "percent",
                          ctx.workspace.currency,
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- the month's own words ------------------------------------ */}
      {notesFor(null).length > 0 ? (
        <section className="keep-together mb-9">
          <h2 className="font-display text-heading font-medium text-ink">
            Notes from your Allegro team
          </h2>
          {notesFor(null).map((note) => (
            <p key={note.id} className="mt-2 whitespace-pre-wrap text-body text-ink/85">
              {note.body}
            </p>
          ))}
        </section>
      ) : null}

      {reflection?.body ? (
        <section className="keep-together mb-9">
          <h2 className="font-display text-heading font-medium text-ink">Your reflection</h2>
          <p className="mt-2 whitespace-pre-wrap text-body text-ink/85">{reflection.body}</p>
        </section>
      ) : null}

      {objectives.length > 0 ? (
        <section className="keep-together mb-9">
          <h2 className="font-display text-heading font-medium text-ink">
            What we&rsquo;re focusing on next month
          </h2>
          <ol className="mt-3 flex flex-col gap-2">
            {objectives.map((objective, i) => (
              <li key={objective.id} className="flex gap-3 text-body text-ink/85">
                <span className="font-mono text-small text-ink/45">{i + 1}</span>
                <span className="whitespace-pre-wrap">{objective.body}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sections.length === 0 && launchCards.length === 0 ? (
        <p className="text-body text-ink/70">
          Nothing has been entered for {ctx.month.label} yet.
        </p>
      ) : null}

      <footer className="mt-10 border-t border-ink/20 pt-4">
        <p className="text-caption text-ink/55">
          {ctx.workspace.business_name} · {ctx.month.label} · prepared by Allegro Strategia
        </p>
      </footer>
    </main>
  );
}
