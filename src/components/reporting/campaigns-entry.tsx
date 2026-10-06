"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Badge, Card, Eyebrow, SectionTitle } from "@/components/ui/card";
import { calculate } from "@/lib/reporting/calculate";
import { formatValue, fromInputValue, toInputValue } from "@/lib/reporting/format";
import { ads, type AdCampaign, type CampaignGoal } from "@/lib/reporting/formulas";
import {
  retireCampaign,
  saveCampaign,
  saveCampaignMonth,
  type CampaignState,
} from "@/lib/reporting/campaign-actions";
import type { ReportEntity } from "@/lib/reporting/queries";

/**
 * The Ads entry screen (§5.7).
 *
 * One block per campaign, each set up once with a name and a goal, then
 * carrying its figures each month — the same shape as Offers.
 *
 * **The goal is load-bearing and the screen says so.** Cost per lead counts
 * lead- and sales-goal campaigns only; on the §10.2 sample that is £4.50
 * against a blended £6.00. A campaign with no goal is left out of it and
 * named in a warning at the top, because the alternative — counting it —
 * changes the headline figure according to something nobody has decided.
 */

export interface CampaignsEntryProps {
  workspaceId: string;
  month: string;
  previousLabel: string | null;
  currency: string;
  campaigns: ReportEntity[];
  /** `${metricKey}|${campaignId}` → this month's figure. */
  values: Record<string, number | null>;
  previous: Record<string, number | null>;
}

const MONTH_FORM = "campaigns-month";

const FIGURES = [
  { key: "ads_spend", label: "Spend", unit: "currency" as const },
  { key: "ads_impressions", label: "Impressions", unit: "count" as const },
  { key: "ads_link_clicks", label: "Link clicks", unit: "count" as const },
  { key: "ads_leads", label: "Leads", unit: "count" as const },
  { key: "ads_purchases", label: "Purchases", unit: "count" as const },
  { key: "ads_revenue_from_ads", label: "Revenue from ads", unit: "currency" as const },
  { key: "ads_reach", label: "Reach", unit: "count" as const, optional: true },
];

export const GOAL_LABELS: Record<CampaignGoal, string> = {
  leads: "Leads",
  sales: "Sales",
  profile_visits: "Profile visits",
  traffic: "Traffic",
  awareness: "Awareness",
};

/** The two that count towards cost per lead (§5.7). */
const COUNTS_TOWARDS_CPL: CampaignGoal[] = ["leads", "sales"];

export function CampaignsEntry(props: CampaignsEntryProps) {
  const [state, action] = useActionState<CampaignState, FormData>(saveCampaignMonth, null);

  const active = props.campaigns.filter((c) => c.active);
  const retired = props.campaigns.filter((c) => !c.active);

  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      active.flatMap((campaign) =>
        FIGURES.map((f) => [
          `${f.key}|${campaign.id}`,
          toInputValue(props.values[`${f.key}|${campaign.id}`]),
        ]),
      ),
    ),
  );

  const read = (key: string, id: string) => fromInputValue(typed[`${key}|${id}`] ?? "");

  const rows: AdCampaign[] = useMemo(
    () =>
      active.map((campaign) => ({
        name: campaign.name,
        goal: campaign.campaign_goal,
        spend: read("ads_spend", campaign.id),
        impressions: read("ads_impressions", campaign.id),
        linkClicks: read("ads_link_clicks", campaign.id),
        leads: read("ads_leads", campaign.id),
        purchases: read("ads_purchases", campaign.id),
        revenue: read("ads_revenue_from_ads", campaign.id),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, typed],
  );

  const results = useMemo(() => calculate("ads", { value: () => null, previous: () => null, adCampaigns: rows }), [rows]);
  const totals = useMemo(() => ads.totals(rows), [rows]);
  const ungoaled = useMemo(() => ads.withoutGoal(rows), [rows]);

  return (
    <div className="flex flex-col gap-6">
      {ungoaled.length > 0 ? (
        <Card>
          <SectionTitle>
            {ungoaled.length === 1
              ? "One campaign has no goal set"
              : `${ungoaled.length} campaigns have no goal set`}
          </SectionTitle>
          <p className="text-body text-ink/70">
            {ungoaled.map((c) => c.name).join(", ")}
            {ungoaled.length === 1 ? " is" : " are"} <strong>not counted</strong> in cost
            per lead, which uses lead and sales campaigns only. Set a goal below if that
            is wrong — nothing is assumed.
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle aside={`${active.length} running`}>Campaigns</SectionTitle>
        <p className="mb-4 text-body text-ink/70">
          Set up once. The goal decides whether a campaign&rsquo;s spend counts towards
          cost per lead.
        </p>
        <div className="flex flex-col gap-3">
          {active.map((campaign) => (
            <CampaignSetup key={campaign.id} workspaceId={props.workspaceId} campaign={campaign} />
          ))}
          <CampaignSetup workspaceId={props.workspaceId} campaign={null} />
        </div>

        {retired.length > 0 ? (
          <details className="mt-4 border-t border-ink/8 pt-3">
            <summary className="cursor-pointer list-none text-small text-ink/60 underline underline-offset-4">
              {retired.length} retired
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {retired.map((campaign) => (
                <CampaignSetup
                  key={campaign.id}
                  workspaceId={props.workspaceId}
                  campaign={campaign}
                />
              ))}
            </div>
          </details>
        ) : null}
      </Card>

      {active.length === 0 ? null : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <SectionTitle>This month</SectionTitle>
            <form action={action} id={MONTH_FORM} className="contents">
              <input type="hidden" name="workspace_id" value={props.workspaceId} />
              <input type="hidden" name="month" value={props.month} />
            </form>

            <div className="flex flex-col gap-6">
              {active.map((campaign) => (
                <div key={campaign.id} className="border-t border-ink/8 pt-4 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-body font-medium text-ink">
                      {campaign.name}
                    </h3>
                    <GoalBadge goal={campaign.campaign_goal} />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {FIGURES.map((figure) => {
                      const field = `${figure.key}|${campaign.id}`;
                      const last = props.previous[field];
                      return (
                        <div key={field} className="flex flex-col gap-1.5">
                          <label
                            htmlFor={`v-${field}`}
                            className="text-small font-medium text-ink"
                          >
                            {figure.label}
                            {figure.optional ? (
                              <span className="ml-1 text-ink/45">(optional)</span>
                            ) : null}
                          </label>
                          <input
                            id={`v-${field}`}
                            form={MONTH_FORM}
                            name={`v:${figure.key}:${campaign.id}`}
                            value={typed[field] ?? ""}
                            onChange={(event) =>
                              setTyped((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }))
                            }
                            inputMode="decimal"
                            autoComplete="off"
                            className="w-full rounded-xl border border-ink/12 bg-cream-deep px-3.5 py-2.5 font-mono text-body text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30"
                          />
                          {last !== null && last !== undefined && props.previousLabel ? (
                            <p className="text-caption text-ink/55">
                              {props.previousLabel}:{" "}
                              {formatValue(last, figure.unit, props.currency)}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <MonthFooter state={state} />
          </Card>

          <WorkedOut
            results={results}
            totals={totals}
            currency={props.currency}
            ungoaled={ungoaled.length}
          />
        </div>
      )}
    </div>
  );
}

function GoalBadge({ goal }: { goal: CampaignGoal | null }) {
  if (!goal) {
    return <Badge tone="neutral">No goal set</Badge>;
  }
  return (
    <Badge tone={COUNTS_TOWARDS_CPL.includes(goal) ? "gold" : "neutral"}>
      {GOAL_LABELS[goal]}
    </Badge>
  );
}

function CampaignSetup({
  workspaceId,
  campaign,
}: {
  workspaceId: string;
  campaign: ReportEntity | null;
}) {
  const [state, action] = useActionState<CampaignState, FormData>(saveCampaign, null);
  const [retireState, retireAction] = useActionState<CampaignState, FormData>(
    retireCampaign,
    null,
  );

  return (
    <div className="rounded-xl bg-cream-deep/60 p-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        {campaign ? <input type="hidden" name="campaign_id" value={campaign.id} /> : null}

        <div className="min-w-50 flex-1">
          <label
            htmlFor={`campaign-name-${campaign?.id ?? "new"}`}
            className="text-small font-medium text-ink"
          >
            {campaign ? "Name" : "Add a campaign"}
          </label>
          <input
            id={`campaign-name-${campaign?.id ?? "new"}`}
            name="name"
            defaultValue={campaign?.name ?? ""}
            placeholder={campaign ? "" : "Campaign name, as it reads in Ads Manager"}
            className="mt-1.5 w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
          />
        </div>

        <div className="min-w-40">
          <label
            htmlFor={`campaign-goal-${campaign?.id ?? "new"}`}
            className="text-small font-medium text-ink"
          >
            Goal
          </label>
          <select
            id={`campaign-goal-${campaign?.id ?? "new"}`}
            name="campaign_goal"
            defaultValue={campaign?.campaign_goal ?? ""}
            className="mt-1.5 w-full rounded-xl border border-ink/12 bg-card px-3.5 py-2.5 text-body text-ink outline-none transition focus:border-orange focus:ring-2 focus:ring-orange/30"
          >
            <option value="">Not set</option>
            {Object.entries(GOAL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <SetupButton existing={Boolean(campaign)} />
      </form>

      <p
        aria-live="polite"
        className={`mt-2 text-small ${state?.error || retireState?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {state?.error ?? state?.notice ?? retireState?.error ?? retireState?.notice ?? ""}
      </p>

      {campaign ? (
        <form action={retireAction} className="mt-1">
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <input type="hidden" name="campaign_id" value={campaign.id} />
          {campaign.active ? null : <input type="hidden" name="restore" value="1" />}
          <button
            type="submit"
            className="text-small text-ink/55 underline underline-offset-4 transition hover:text-ink"
          >
            {campaign.active ? "Retire this campaign" : "Put it back"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function SetupButton({ existing }: { existing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? "Saving…" : existing ? "Save" : "Add"}
    </Button>
  );
}

function MonthFooter({ state }: { state: CampaignState }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 pt-4">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending ? "Saving…" : (state?.error ?? state?.notice ?? "Nothing is saved until you press save.")}
      </p>
      <Button type="submit" form={MONTH_FORM} disabled={pending}>
        Save this month
      </Button>
    </div>
  );
}

function WorkedOut({
  results,
  totals,
  currency,
  ungoaled,
}: {
  results: Record<string, number | null>;
  totals: ReturnType<typeof ads.totals>;
  currency: string;
  ungoaled: number;
}) {
  const lines: { label: string; value: number | null | undefined; unit: "currency" | "count" | "percent" | "ratio"; note?: string }[] = [
    { label: "Total spend", value: totals.spend, unit: "currency" },
    { label: "Impressions", value: totals.impressions, unit: "count" },
    { label: "Link clicks", value: totals.linkClicks, unit: "count" },
    { label: "Leads", value: totals.leads, unit: "count" },
    { label: "CPM", value: results.ads_cpm, unit: "currency", note: "Spend ÷ impressions × 1,000" },
    { label: "CTR", value: results.ads_ctr, unit: "percent", note: "Clicks ÷ impressions" },
    { label: "CPC", value: results.ads_cpc, unit: "currency", note: "Spend ÷ clicks" },
    {
      label: "Cost per lead",
      value: results.ads_cost_per_lead,
      unit: "currency",
      note:
        ungoaled > 0
          ? `Lead and sales campaigns only — ${ungoaled} not counted`
          : "Lead and sales campaigns only",
    },
    { label: "ROAS", value: results.ads_roas, unit: "ratio", note: "Revenue ÷ spend" },
  ];

  return (
    <aside>
      <div className="rounded-card bg-lemon p-5">
        <h2 className="font-display text-heading font-medium text-ink">Worked out for you</h2>
        <Eyebrow className="mt-1.5">These update as you type</Eyebrow>

        <dl className="mt-5 flex flex-col gap-4">
          {lines.map((line) => (
            <div key={line.label} className="border-t border-ink/10 pt-4 first:border-0 first:pt-0">
              <dt className="text-small text-ink/70">{line.label}</dt>
              <dd className="font-mono text-heading text-ink">
                {formatValue(line.value ?? null, line.unit, currency)}
              </dd>
              {line.note ? <p className="mt-0.5 text-caption text-ink/50">{line.note}</p> : null}
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
