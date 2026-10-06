import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EntryForm } from "@/components/reporting/entry-form";
import { OffersEntry } from "@/components/reporting/offers-entry";
import { CampaignsEntry } from "@/components/reporting/campaigns-entry";
import { PublishBadge, ReportShell } from "@/components/reporting/report-shell";
import { ENTRY_CATEGORIES, categoryBySlug } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { monthLabel } from "@/lib/reporting/months";
import { getClientFlow, getMetrics, getMetricsFor, getMonthData } from "@/lib/reporting/queries";
import { activeClientsAtStart, openingFigures } from "@/lib/reporting/client-flow";
import { openingNote, type OpeningNote } from "@/lib/reporting/opening-note";
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

  // §5.8. Only Client Experience needs it, and loading a client's whole
  // history for the other eight screens would be work for nothing.
  const flow =
    category.key === "client_experience"
      ? await getClientFlow(ctx.workspace.id, ctx.month.month)
      : [];
  const opening = openingFigures(flow);
  const clientsAtStart = activeClientsAtStart(flow, ctx.month.month) ?? null;
  const note =
    category.key === "client_experience"
      ? openingNote({
          ...opening,
          thisMonth: ctx.month.month,
          firstMonth: ctx.workspace.first_month,
          carried: clientsAtStart,
        })
      : null;
  // What is typed here is the figure in use only on the month that holds it
  // — or on the month about to hold it, when there is none yet.
  const openingAppliesHere = note?.kind === "ask" || note?.kind === "in_use";

  // §5.8's opening figure is typed once, so its box appears on one month
  // and not on the other eleven — Dom, 6 Oct: "I don't want Nina prompted
  // in the wrong month." It is a `core` metric, so without this the generic
  // form would render it on every screen.
  // Ads hangs off a campaign the way Offers hangs off an offer (§5.7), so
  // it gets its own screen for the same reason: the generic form writes
  // one figure per metric per month and would merge nine campaigns into
  // one set of totals.
  if (category.key === "ads") {
    const campaigns = data.entities.filter((e) => e.entity_type === "ad_campaign");
    const CAMPAIGN_KEYS = [
      "ads_spend",
      "ads_impressions",
      "ads_link_clicks",
      "ads_leads",
      "ads_purchases",
      "ads_revenue_from_ads",
      "ads_reach",
    ];
    const cell = (source: typeof data.values, key: string, id: string) =>
      [`${key}|${id}`, source.get(key, id)] as const;

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
        <CampaignsEntry
          workspaceId={ctx.workspace.id}
          month={ctx.month.month}
          previousLabel={previousLabel}
          currency={ctx.workspace.currency}
          campaigns={campaigns}
          values={Object.fromEntries(
            campaigns.flatMap((c) => CAMPAIGN_KEYS.map((k) => cell(data.values, k, c.id))),
          )}
          previous={Object.fromEntries(
            campaigns.flatMap((c) => CAMPAIGN_KEYS.map((k) => cell(data.previous, k, c.id))),
          )}
        />
      </ReportShell>
    );
  }

  const core = metrics
    .filter((m) => m.input_type === "core")
    .filter((m) => m.key !== OPENING_KEY || (note?.field ?? false));
  const optional = metrics.filter((m) => m.input_type === "optional");
  // Pulled metrics belong on the card too. "Revenue from offers" is the
  // figure the whole Financials page is built on, and leaving it off meant
  // whoever was entering could not see what the totals were working from.
  const calculated = metrics.filter(
    (m) => m.input_type === "calc" || m.input_type === "pulled",
  );

  // The calculated card needs last month for growth and rate-against-last-
  // month figures, and every typed field needs it for the hint underneath.
  // Social Media's figures hang off a platform, not off the month (§5.2),
  // and `saveCategoryValues` writes them that way. Reading them back
  // without the platform finds nothing — so every box came back empty
  // after a save, and "Worked out for you" showed dashes beside a report
  // full of figures. §9's disagreement, live since Stage 2, found 6 Oct by
  // the figure-agreement test on its first run.
  const platformId =
    data.entities.find((e) => e.entity_type === "social_platform")?.id ?? null;
  const entityOf = (metric: { entity_type: string | null }) =>
    metric.entity_type === "social_platform" ? platformId : null;

  const forEntry = [...core, ...optional, ...calculated];
  const initial = Object.fromEntries(
    [...core, ...optional].map((m) => [m.key, data.values.get(m.key, entityOf(m))]),
  );
  const previous = Object.fromEntries(
    forEntry.map((m) => [m.key, data.previous.get(m.key, entityOf(m))]),
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

  // Every figure this category's formulas read from another one. Only
  // month-level typed values: anything derived is worked out by the card
  // itself, and anything per-entity has no single answer here.
  const elsewhere = Object.fromEntries(
    (await getMetrics())
      .filter((m) => m.category !== category.key && m.entity_type === null)
      .filter((m) => m.input_type === "core" || m.input_type === "optional")
      .map((m) => [m.key, data.values.get(m.key)]),
  );

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
      {note ? <OpeningFigureNote note={note} /> : null}

      <EntryForm
        offerRows={offerRowsForEntry}
        elsewhere={elsewhere}
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

const OPENING_KEY = "client_experience_clients_at_start_opening";

/**
 * Which opening figure is in use, said out loud.
 *
 * §5.8's figure is typed once and carried forward, so on every month but
 * one the box is not the figure doing the work — and on those months there
 * is no box at all. Every word below comes from `openingNote()`, which is
 * tested: the wording is the part that can be wrong without anybody
 * noticing, and reading my own component was not evidence that it was
 * right (Dom spotted it backwards in a handover note, 6 Oct).
 */
function OpeningFigureNote({ note }: { note: OpeningNote }) {
  if (note.kind === "ask") {
    return (
      <Card className="mb-6">
        <SectionTitle>Start with the opening figure</SectionTitle>
        <p className="text-body text-ink/70">
          &ldquo;Clients at the start, when you joined&rdquo; is typed once, on
          this month. Every month after it carries on from the month before,
          so retention, churn and the rest stay dashes until it is filled in.
        </p>
      </Card>
    );
  }

  if (note.kind === "ask_elsewhere") {
    return (
      <Card className="mb-6">
        <SectionTitle>The opening figure goes on {monthLabel(note.belongsOn)}</SectionTitle>
        <p className="text-body text-ink/70">
          It is typed once, on the first month of this client&rsquo;s reporting,
          and carried forward from there. Until it is set, retention, churn and
          active clients stay dashes on every month.
        </p>
      </Card>
    );
  }

  if (note.kind === "in_use") {
    return (
      <Card className="mb-6">
        <SectionTitle>This is the opening figure</SectionTitle>
        <p className="text-body text-ink/70">
          <span className="font-mono">{note.value}</span> clients at the start,
          set on this month. Every later month carries on from here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <SectionTitle>Carried from earlier</SectionTitle>
      <p className="text-body text-ink/70">
        The opening figure is <span className="font-mono">{note.value}</span>,
        set on {monthLabel(note.from)}. This month starts with{" "}
        <span className="font-mono">{note.carried ?? "—"}</span>, carried
        forward from the months in between.
      </p>

      {note.stray ? (
        <p className="mt-3 text-small text-deep-red">
          There is also an opening figure of{" "}
          <span className="font-mono">{note.stray.value}</span> stored on this
          month. <strong>It is not in use</strong> — the earliest one is, and
          that is {monthLabel(note.from)}. Clear the box below, or clear the
          one on {monthLabel(note.from)}, so there is only one.
        </p>
      ) : null}

      {note.otherStrays.length > 0 ? (
        <p className="mt-3 text-small text-deep-red">
          {note.otherStrays.length === 1
            ? `There is another opening figure on ${monthLabel(note.otherStrays[0].month)}, and it is not in use.`
            : `There are ${note.otherStrays.length} other opening figures stored, and none of them is in use.`}
        </p>
      ) : null}
    </Card>
  );
}
