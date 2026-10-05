import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KpiCard } from "@/components/reporting/kpi-card";
import { StrategistNotes } from "@/components/reporting/notes";
import { PublishBadge, ReportShell } from "@/components/reporting/report-shell";
import { buttonClasses } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { categoryBySlug } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { formatValue } from "@/lib/reporting/format";
import { getMonthFigures, offerBreakdown } from "@/lib/reporting/month-figures";
import { monthLabel } from "@/lib/reporting/months";
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
  const previousLabel = ctx.month.previous
    ? monthLabel(ctx.month.previous).split(" ")[0]
    : null;

  const metrics = figures.metrics.filter((m) => m.category === category.key);
  const headline = metrics
    .filter((m) => m.input_type === "core" || m.input_type === "calc")
    .filter((m) => figures.figure(m.key) !== null)
    .slice(0, 6);
  const rest = metrics.filter(
    (m) => !headline.includes(m) && figures.figure(m.key) !== null,
  );

  const notes = figures.data.notes.filter(
    (n) => n.note_type === "strategist" && n.category === category.key,
  );
  const mine = notes.find((n) => n.author_id === ctx.reportUser.id) ?? null;

  // §4: "A category with no data for a month doesn't appear in that month's
  // report. No toggles needed." Here that means saying so plainly rather than
  // drawing a page of dashes.
  const empty = headline.length === 0 && rest.length === 0;

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
        // A client who reached an unpublished month by URL. Saying the
        // section "wasn't part of this month's report" would be a lie —
        // it may be full of figures that are simply not theirs yet.
        <Card>
          <SectionTitle>{ctx.month.label} isn&rsquo;t ready yet</SectionTitle>
          <p className="text-body text-ink/70">
            Your strategist is still putting this month together. You&rsquo;ll be
            told when it&rsquo;s ready to read.
          </p>
        </Card>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {headline.map((metric) => (
              <KpiCard
                key={metric.key}
                label={metric.label}
                value={figures.figure(metric.key)}
                previous={figures.previousFigure(metric.key)}
                unit={metric.unit}
                goodDirection={metric.good_direction}
                currency={ctx.workspace.currency}
                previousLabel={previousLabel}
              />
            ))}
          </div>

          {category.key === "leads_conversions" ? (
            <Card className="mt-6">
              <SectionTitle aside={ctx.month.label}>Where the leads came from</SectionTitle>
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
                  <SectionTitle aside={ctx.month.label}>Share of revenue</SectionTitle>
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
              <OffersTable ctx={ctx} figures={figures} />
            </>
          ) : null}

          {category.key === "financials" ? (
            <Card className="mt-6">
              <SectionTitle aside={ctx.month.label}>Where the money went</SectionTitle>
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
              <SectionTitle>Everything else this month</SectionTitle>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((metric) => (
                  <div
                    key={metric.key}
                    className="flex items-baseline justify-between gap-4 border-b border-ink/8 pb-3"
                  >
                    <dt className="text-small text-ink/70">{metric.label}</dt>
                    <dd className="font-mono text-body text-ink">
                      {formatValue(
                        figures.figure(metric.key),
                        metric.unit,
                        ctx.workspace.currency,
                      )}
                    </dd>
                  </div>
                ))}
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
 * One row per offer (§5.9), because "total revenue from offers" says nothing
 * about which offer earned it and the point of the page is the comparison.
 */
function OffersTable({
  ctx,
  figures,
}: {
  ctx: Awaited<ReturnType<typeof resolveReportContext>>;
  figures: Awaited<ReturnType<typeof getMonthFigures>>;
}) {
  const rows = offerBreakdown(figures);
  if (rows.length === 0) return null;

  const currency = ctx.workspace.currency;

  return (
    <Card className="mt-6" padded={false}>
      <div className="p-5 sm:p-6">
        <SectionTitle>Each offer this month</SectionTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr className="border-y border-ink/8 text-caption text-ink/55 uppercase">
              <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Offer</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Sold</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Revenue</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Hours</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Margin</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">
                Hourly rate
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ offer, results }) => (
              <tr key={offer.name} className="border-b border-ink/8 last:border-0">
                <th scope="row" className="px-5 py-3 text-body font-medium text-ink sm:px-6">
                  {offer.name}
                  {offer.pricingModel === "recurring" ? (
                    <span className="ml-2 text-caption text-ink/50">Recurring</span>
                  ) : null}
                </th>
                {/* "Units sold" is labelled "Members" on a recurring offer
                    (§5.9); the column header stays generic and the row says
                    which it is. */}
                <td className="px-3 py-3 text-right font-mono text-body text-ink">
                  {formatValue(offer.unitsSold ?? null, "count")}
                </td>
                <td className="px-3 py-3 text-right font-mono text-body text-ink">
                  {formatValue(offer.revenue ?? null, "currency", currency)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-body text-ink">
                  {formatValue(offer.hoursSpent ?? null, "hours")}
                </td>
                <td className="px-3 py-3 text-right font-mono text-body text-ink">
                  {formatValue(results.offers_margin, "percent")}
                </td>
                <td className="px-5 py-3 text-right font-mono text-body text-ink sm:px-6">
                  {formatValue(results.offers_effective_hourly_rate, "currency", currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
