import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EntryForm } from "@/components/reporting/entry-form";
import { OffersEntry } from "@/components/reporting/offers-entry";
import { PublishBadge, ReportShell } from "@/components/reporting/report-shell";
import { ENTRY_CATEGORIES, categoryBySlug } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { monthLabel } from "@/lib/reporting/months";
import { getClientFlow, getMetricsFor, getMonthData } from "@/lib/reporting/queries";
import { activeClientsAtStart, openingFigures } from "@/lib/reporting/client-flow";
import { Card, SectionTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Enter your data — aOS",
};

/**
 * The entry screen, for one category and one month.
 *
 * One page for every category: the fields come from `report_metrics`, so
 * adding a field to the brief is a row in the seed and nothing here changes
 * (§9). The categories that are not ready yet have no route at all rather
 * than a page saying so — §13's one-route rule.
 */
export default async function EnterCategoryPage({
  params,
  searchParams,
}: PageProps<"/reporting/enter/[category]">) {
  const { category: slug } = await params;
  const search = await searchParams;

  const category = categoryBySlug(slug);
  if (!category || !category.entry) notFound();

  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  // A retainer client has no entry screen at all (§2: they view and comment).
  // Sent to the report rather than shown a refusal — the refusal would be
  // explaining a screen that is not theirs to think about.
  if (!ctx.canEdit) {
    redirect(reportHref(`/reporting/${category.slug}`, ctx));
  }

  // Hidden categories do not appear and do not count towards completion
  // (§8.1), so there is nothing here to fill in either.
  if (ctx.workspace.hidden_categories.includes(category.key)) {
    redirect(reportHref("/reporting", ctx));
  }

  const [metrics, data] = await Promise.all([
    getMetricsFor(category.key),
    getMonthData(ctx.workspace.id, ctx.month.month, ctx.month.previous),
  ]);

  const previousLabel = ctx.month.previous
    ? monthLabel(ctx.month.previous).split(" ")[0]
    : null;

  // Offers is the one Stage 2 category whose figures hang off a row rather
  // than off the month (§5.9), so it has its own screen. The generic form
  // below would write one figure per metric per month and quietly merge
  // four offers into one.
  if (category.key === "offers") {
    const offers = data.entities.filter((e) => e.entity_type === "offer");
    const cell = (source: typeof data.values, key: string, id: string) =>
      [`${key}|${id}`, source.get(key, id)] as const;
    const KEYS = [
      "offers_units_sold",
      "offers_revenue_this_month",
      "offers_hours_spent_delivering",
      "offers_other_direct_costs",
    ];

    return (
      <ReportShell
        ctx={ctx}
        active={category.key}
        path={`/reporting/enter/${category.slug}`}
        title="Enter your data"
        tagline={`${category.label} · ${ctx.month.label}`}
        actions={
          <PublishBadge
            kind={ctx.workspace.kind}
            publishedAt={data.period?.published_at ?? null}
            show={ctx.showDraftState}
          />
        }
      >
        <OffersEntry
          workspaceId={ctx.workspace.id}
          month={ctx.month.month}
          previousLabel={previousLabel}
          currency={ctx.workspace.currency}
          offers={offers}
          values={Object.fromEntries(
            offers.flatMap((o) => KEYS.map((k) => cell(data.values, k, o.id))),
          )}
          previous={Object.fromEntries(
            offers.flatMap((o) => KEYS.map((k) => cell(data.previous, k, o.id))),
          )}
        />
      </ReportShell>
    );
  }

  const core = metrics.filter((m) => m.input_type === "core");
  const optional = metrics.filter((m) => m.input_type === "optional");
  // Pulled metrics belong on the card too. "Revenue from offers" is the
  // figure the whole Financials page is built on, and leaving it off meant
  // whoever was entering could not see what the totals were working from.
  const calculated = metrics.filter(
    (m) => m.input_type === "calc" || m.input_type === "pulled",
  );

  // The calculated card needs last month for growth and rate-against-last-
  // month figures, and every typed field needs it for the hint underneath.
  const keysNeeded = [...core, ...optional, ...calculated].map((m) => m.key);
  const initial = Object.fromEntries(
    [...core, ...optional].map((m) => [m.key, data.values.get(m.key)]),
  );
  const previous = Object.fromEntries(
    keysNeeded.map((key) => [key, data.previous.get(key)]),
  );

  // The month's offers, in the shape the formulas take. Financials pulls
  // its revenue from them (§5.10), so without these the entry card showed
  // dashes for Total revenue, Profit and the margin while the report —
  // which does pass them — showed the real figures. §9 says those two must
  // never disagree.
  const offerRowsForEntry = data.entities
    .filter((e) => e.entity_type === "offer")
    .map((offer) => ({
      name: offer.name,
      hourlyCost: offer.hourly_cost,
      pricingModel: offer.pricing_model ?? undefined,
      unitsSold: data.values.get("offers_units_sold", offer.id),
      revenue: data.values.get("offers_revenue_this_month", offer.id),
      hoursSpent: data.values.get("offers_hours_spent_delivering", offer.id),
      otherDirectCosts: data.values.get("offers_other_direct_costs", offer.id),
    }))
    .filter((r) => r.unitsSold !== null || r.revenue !== null || r.hoursSpent !== null);

  // §5.8. Only Client Experience needs it, and loading a client's whole
  // history for the other eight screens would be work for nothing.
  const flow =
    category.key === "client_experience"
      ? await getClientFlow(ctx.workspace.id, ctx.month.month)
      : [];
  const opening = openingFigures(flow);
  const clientsAtStart = activeClientsAtStart(flow, ctx.month.month) ?? null;
  // The box on this screen is the one in use when it holds the earliest
  // opening figure — or when there is no opening figure anywhere yet, which
  // is the case the very first time somebody fills this in.
  const openingAppliesHere =
    opening.inUse === null || opening.inUse.month === ctx.month.month;

  // "Save & next section" walks the entry categories in tab order.
  const order = ENTRY_CATEGORIES.filter(
    (c) => !ctx.workspace.hidden_categories.includes(c.key),
  );
  const position = order.findIndex((c) => c.key === category.key);
  const next = position >= 0 ? order[position + 1] : undefined;

  return (
    <ReportShell
      ctx={ctx}
      active={category.key}
      path={`/reporting/enter/${category.slug}`}
      title="Enter your data"
      tagline={`${category.label} · ${ctx.month.label}`}
      actions={
        <PublishBadge
          kind={ctx.workspace.kind}
          publishedAt={data.period?.published_at ?? null}
          show={ctx.showDraftState}
        />
      }
    >
      {category.key === "client_experience" ? (
        <OpeningFigureNote
          opening={opening}
          thisMonth={ctx.month.month}
          carried={clientsAtStart}
        />
      ) : null}

      <EntryForm
        offerRows={offerRowsForEntry}
        clientsAtStart={clientsAtStart}
        openingAppliesHere={openingAppliesHere}
        category={category.key}
        categoryLabel={category.label}
        workspaceId={ctx.workspace.id}
        month={ctx.month.month}
        previousLabel={previousLabel}
        currency={ctx.workspace.currency}
        core={core}
        optional={optional}
        calculated={calculated}
        initial={initial}
        previous={previous}
        nextHref={
          next ? reportHref(`/reporting/enter/${next.slug}`, ctx) : null
        }
        // "Save & Email" reads as emailing the report rather than moving
        // to the Email section. The mockup's own wording avoids that.
        nextLabel={next ? "Save & next section" : null}
      />
    </ReportShell>
  );
}

/**
 * Which opening figure is in use, said out loud.
 *
 * §5.8's figure is typed once and carried forward, so on every month but
 * one the box on this screen is not the figure doing the work. Saying
 * nothing would leave somebody typing into a field that changes nothing —
 * and Dom's condition (5 Oct) is that a second one is marked as not in use
 * rather than silently ignored.
 */
function OpeningFigureNote({
  opening,
  thisMonth,
  carried,
}: {
  opening: ReturnType<typeof openingFigures>;
  thisMonth: string;
  carried: number | null;
}) {
  const { inUse, unused } = opening;
  const strayHere = unused.find((u) => u.month === thisMonth);

  if (!inUse) {
    return (
      <Card className="mb-6">
        <SectionTitle>Start with the opening figure</SectionTitle>
        <p className="text-body text-ink/70">
          &ldquo;Clients at the start, when you joined&rdquo; is typed once.
          Every month after this one carries on from the month before, so
          retention, churn and the rest stay dashes until it is filled in.
        </p>
      </Card>
    );
  }

  const inUseHere = inUse.month === thisMonth;

  return (
    <Card className="mb-6">
      <SectionTitle>
        {inUseHere ? "This is the opening figure" : "Carried from earlier"}
      </SectionTitle>
      <p className="text-body text-ink/70">
        {inUseHere ? (
          <>
            <span className="font-mono">{inUse.value}</span> clients at the start,
            from {monthLabel(inUse.month)}. Every later month carries on from
            here.
          </>
        ) : (
          <>
            The opening figure is{" "}
            <span className="font-mono">{inUse.value}</span>, set on{" "}
            {monthLabel(inUse.month)}. This month starts with{" "}
            <span className="font-mono">{carried ?? "—"}</span>, carried forward
            from the months in between.
          </>
        )}
      </p>

      {strayHere ? (
        <p className="mt-3 text-small text-deep-red">
          There is also an opening figure of{" "}
          <span className="font-mono">{strayHere.value}</span> stored on this
          month. <strong>It is not in use</strong> — the earliest one is, and
          that is {monthLabel(inUse.month)}. Clear it, or clear the other, so
          there is only one.
        </p>
      ) : null}

      {!inUseHere && unused.length > 0 && !strayHere ? (
        <p className="mt-3 text-small text-deep-red">
          {unused.length === 1
            ? `There is another opening figure on ${monthLabel(unused[0].month)}, and it is not in use.`
            : `There are ${unused.length} other opening figures stored, and none of them is in use.`}
        </p>
      ) : null}
    </Card>
  );
}
