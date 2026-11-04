import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ReportShell } from "@/components/reporting/report-shell";
import { SavedBanner } from "@/components/reporting/saved-banner";
import { BusinessForm, SectionsForm } from "@/components/reporting/settings-forms";
import { ENTRY_CATEGORIES, STAGE_5 } from "@/lib/reporting/categories";
import { reportHref, resolveReportContext } from "@/lib/reporting/context";
import { formatValue } from "@/lib/reporting/format";
import type { ReportEntity } from "@/lib/reporting/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your report settings — aOS" };

/**
 * §8.1 and §10.3: what a member owns about their own report.
 *
 * The business and its currency, the hourly rate §5.9's dashed line
 * needs, the three answers the benchmark prompt asks, and which sections
 * they use.
 *
 * **Not admin-only**, which is the point of it existing: a retainer
 * client cannot reach it because `canEdit` is false for them by design,
 * and a member can because they are their own editor. The database holds
 * the same rule — `report_workspaces_update_editors`, plus a guard that
 * refuses a change to kind, owner, access end date or first month from
 * anybody but an admin.
 */
export default async function ReportSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!STAGE_5) notFound();

  const search = await searchParams;
  const ctx = await resolveReportContext({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    month: typeof search.month === "string" ? search.month : undefined,
  });

  if (!ctx.canEdit) redirect(reportHref("/reporting", ctx));

  const returnTo = reportHref("/reporting/settings", ctx);

  // The offers, for the potential-revenue picker. **Retired offers are
  // left out, except the one already chosen** — dropping the current
  // choice out of the list would make the browser fall back to the first
  // option, and saving anything else on this form would then silently
  // clear a setting nobody touched.
  const supabase = await createClient();
  const { data: offerRows } = await supabase
    .from("report_entities")
    .select("id, name, active, price")
    .eq("workspace_id", ctx.workspace.id)
    .eq("entity_type", "offer")
    .order("sort_order")
    .returns<Pick<ReportEntity, "id" | "name" | "active" | "price">[]>();

  const chosen = ctx.workspace.potential_revenue_offer_id;
  const offerChoices = (offerRows ?? [])
    .filter((offer) => offer.active || offer.id === chosen)
    .map((offer) => ({
      id: offer.id,
      label:
        offer.price === null
          ? `${offer.name} — no price yet`
          : `${offer.name} — ${formatValue(offer.price, "currency", ctx.workspace.currency)}`,
      hasPrice: offer.price !== null,
    }));

  return (
    <ReportShell
      ctx={ctx}
      active={null}
      path="/reporting/settings"
      title="Your report"
      tagline={`HOW IT IS SET UP · ${ctx.workspace.business_name}`}
    >
      <SavedBanner saved={search.saved} />

      <BusinessForm
        workspaceId={ctx.workspace.id}
        returnTo={returnTo}
        businessName={ctx.workspace.business_name}
        currency={ctx.workspace.currency}
        targetHourlyRate={ctx.workspace.target_hourly_rate}
        potentialRevenueOfferId={chosen}
        offerChoices={offerChoices}
        trackOfferHours={ctx.workspace.track_offer_hours}
        description={ctx.workspace.benchmark_business_description}
        offers={ctx.workspace.benchmark_main_offers}
        country={ctx.workspace.benchmark_country}
      />

      <SectionsForm
        workspaceId={ctx.workspace.id}
        returnTo={returnTo}
        categories={ENTRY_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
        hidden={ctx.workspace.hidden_categories}
      />
    </ReportShell>
  );
}
