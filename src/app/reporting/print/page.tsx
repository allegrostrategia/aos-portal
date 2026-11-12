import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DonutChart } from "@/components/reporting/charts/donut-chart";
import { costBreakdown, revenueFromWhere } from "@/lib/reporting/chart-data";
import { ENTRY_CATEGORIES } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { formatChange, formatValue } from "@/lib/reporting/format";
import { monthOnMonthChange } from "@/lib/reporting/formulas";
import { monthLabel } from "@/lib/reporting/months";
import { getMonthFigures } from "@/lib/reporting/month-figures";
import { HEADLINE_METRICS, DRAWN_ELSEWHERE } from "@/lib/reporting/trends";

export const metadata: Metadata = { title: "Report · aOS" };

/**
 * The whole month, as a document.
 *
 * **Browser print-to-PDF, the same answer the SOP export gave** (§11,
 * and `/stations/archivio/[id]/print`): no dependency, no server
 * rendering, no font embedding, it works on a phone through the share
 * sheet, and what comes out is a real PDF the client owns. The trade is
 * pagination control, and the page is built to give that up gracefully
 * — a section never splits across a page.
 *
 * §11 says the PDF is **a print of the designed page, not a data
 * download**. So this is the report's own figures, in the report's own
 * order, with the notes that were written on them. The two donuts come
 * with it because they are this month's arithmetic and cost nothing to
 * draw; the twelve-month trend charts do not, because a page of
 * screenshots is not what somebody prints a month for.
 *
 * **What a client can read is RLS's decision, as everywhere.** A
 * retainer client reaching an unpublished month is sent back to the
 * report, which says it is being prepared.
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

  const comparedWith = figures.carried?.previousMonth ?? ctx.month.previous;
  const previousLabel = comparedWith ? monthLabel(comparedWith).split(" ")[0] : null;

  const sections = ENTRY_CATEGORIES.filter(
    (category) => !ctx.workspace.hidden_categories.includes(category.key),
  )
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
        (m) =>
          !shown.includes(m) &&
          !drawn.includes(m.key) &&
          figures.figure(m.key) !== null,
      );

      const notes = figures.data.notes.filter(
        (n) => n.note_type === "strategist" && n.category === category.key,
      );

      return { category, figuresShown: [...shown, ...rest], notes };
    })
    // §4: a category with no data for a month does not appear in that
    // month's report, and a page of headings with nothing under them is
    // the printed version of the same mistake.
    .filter((s) => s.figuresShown.length > 0 || s.notes.length > 0);

  const fromWhere = revenueFromWhere(figures, ctx.month.month, ctx.workspace.currency);
  const went = costBreakdown(figures, ctx.workspace.currency);

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

      {sections.map(({ category, figuresShown, notes }) => (
        <section key={category.key} className="mb-9">
          <h2 className="font-display text-heading font-medium text-ink">{category.label}</h2>

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
                    {changeText && previousLabel ? (
                      <span className="block font-mono text-caption text-ink/55">
                        {changeText} vs. {previousLabel}
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </dl>

          {/* This month's own arithmetic, which prints as well as it
              renders. The twelve-month charts are deliberately not here. */}
          {category.key === "financials" && fromWhere.length > 0 ? (
            <div className="keep-together mt-5">
              <h3 className="mb-2 font-mono text-eyebrow uppercase text-ink/50">
                Where the money came from
              </h3>
              <DonutChart
                slices={fromWhere}
                total={figures.results.financials_total_revenue ?? null}
                totalDisplay={money(figures.results.financials_total_revenue ?? null)}
                totalLabel="Total revenue"
                emptyMessage="No money entered for this month."
              />
            </div>
          ) : null}

          {category.key === "financials" && went.length > 0 ? (
            <div className="keep-together mt-5">
              <h3 className="mb-2 font-mono text-eyebrow uppercase text-ink/50">
                Where the money went
              </h3>
              <DonutChart
                slices={went}
                total={figures.results.financials_total_costs ?? null}
                totalDisplay={money(figures.results.financials_total_costs ?? null)}
                totalLabel="Total costs"
                emptyMessage="No costs entered for this month."
              />
            </div>
          ) : null}

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

      {sections.length === 0 ? (
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
