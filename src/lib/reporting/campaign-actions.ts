"use server";

import { revalidatePath } from "next/cache";

import { recordCsvImportFromForm } from "./csv/column-map-actions.ts";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { firstOfMonth } from "./months.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";
import type { CampaignGoal } from "./formulas.ts";

/**
 * Ad campaigns: their setup, and their monthly figures.
 *
 * The same shape as Offers, because the data has the same shape — §5.7 is
 * "one block per campaign" and the figures hang off the row, so the
 * generic save would merge nine campaigns into one month's totals.
 *
 * **The goal is the part that matters.** It decides whether a campaign's
 * spend counts towards cost per lead, which on the §10.2 sample is the
 * difference between £6.00 and £4.50. A campaign with no goal is left out
 * of that figure and flagged on the entry screen — never counted by
 * default (Nina via Dom, 5 October), because counting it would flatter or
 * wreck the headline depending on what the campaign turned out to be for.
 */

export type CampaignState = { error?: string; notice?: string } | null;

/** Monthly fields are named `v:<metric key>:<campaign id>`. */
const FIELD = /^v:([a-z0-9_]+):([0-9a-f-]{36})$/;

/**
 * A figure typed against a campaign that does not exist yet.
 *
 * `nv:<index>:<metric>`, where the index pairs it with the name and
 * goal in `new:<index>:name` / `new:<index>:goal`. An index rather than
 * the name, because a campaign name can contain anything — including
 * the colons this field is split on.
 */
const NEW_FIELD = /^nv:(\d+):([a-z0-9_]+)$/;
const NEW_NAME = /^new:(\d+):name$/;

/** The campaigns an import asked for, read off the form. */
function pendingCampaigns(
  formData: FormData,
): { index: number; name: string; goal: CampaignGoal | null }[] {
  const out: { index: number; name: string; goal: CampaignGoal | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const match = NEW_NAME.exec(field);
    if (!match) continue;
    const name = raw.trim();
    if (name === "") continue;
    const index = Number(match[1]);
    const goalRaw = String(formData.get(`new:${index}:goal`) ?? "").trim();
    out.push({
      index,
      name,
      goal: GOALS.includes(goalRaw as CampaignGoal) ? (goalRaw as CampaignGoal) : null,
    });
  }
  return out;
}

/** Everything typed against a campaign each month (§5.7). */
const CAMPAIGN_METRICS = new Set([
  "ads_spend",
  "ads_impressions",
  "ads_link_clicks",
  "ads_leads",
  "ads_purchases",
  "ads_revenue_from_ads",
  "ads_reach",
  "ads_profile_visits_from_ads",
]);

const GOALS: CampaignGoal[] = ["leads", "sales", "profile_visits", "traffic", "awareness"];

async function editableWorkspace(workspaceId: string) {
  const reportUser = await requireReportUser();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." } as const;

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });

  if (!mayEdit) {
    return { error: "Your report is filled in by your strategist." } as const;
  }
  return { reportUser, workspace } as const;
}

/**
 * Create a campaign, or change its setup.
 *
 * The goal may be left unset, and saying so is the honest option: Meta's
 * export names a result type per campaign that does not always map onto
 * one of these five, and guessing would put the guess into cost per lead.
 */
export async function saveCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("campaign_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const goalRaw = String(formData.get("campaign_goal") ?? "").trim();

  if (!name) return { error: "A campaign needs a name." };
  if (goalRaw !== "" && !GOALS.includes(goalRaw as CampaignGoal)) {
    return { error: "That is not one of the campaign goals." };
  }
  const goal = goalRaw === "" ? null : (goalRaw as CampaignGoal);

  const supabase = await createClient();
  const fields = {
    workspace_id: workspaceId,
    entity_type: "ad_campaign" as const,
    name,
    campaign_goal: goal,
  };

  const { error } = id
    ? await supabase.from("report_entities").update(fields).eq("id", id)
    : await supabase.from("report_entities").insert(fields);

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `There is already a campaign called "${name}".` };
    }
    return { error: `Couldn't save the campaign: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");
  return { notice: id ? `${name} updated.` : `${name} added.` };
}

/**
 * Retire a campaign.
 *
 * `active = false`, never a delete (rule 7): last month's spend belongs to
 * the campaign that spent it, and a campaign that has stopped running
 * should stop appearing on new months without taking its history with it.
 */
export async function retireCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("campaign_id") ?? "").trim();
  if (!id) return { error: "Which campaign?" };

  const supabase = await createClient();
  const restore = String(formData.get("restore") ?? "") === "1";
  const { error } = await supabase
    .from("report_entities")
    .update({ active: restore })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return { error: `Couldn't update the campaign: ${error.message}` };

  revalidatePath("/reporting", "layout");
  return { notice: restore ? "Back in use." : "Retired. Its past months are untouched." };
}

/** This month's figures for every campaign, in one save. */
export async function saveCampaignMonth(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!month) return { error: "Which month?" };

  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("report_entities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "ad_campaign")
    .returns<{ id: string }[]>();

  const known = new Set((campaigns ?? []).map((c) => c.id));

  // **Campaigns ticked on an import are created here, in the same save
  // as their figures** (Dom, 12 October). They used to be made the
  // moment somebody pressed "Fill these in", which left an empty
  // campaign behind if they then changed their mind — and an empty
  // campaign is not harmless: it renders as a row on the client's
  // published report, with dashes where its figures would be.
  //
  // All or nothing, so abandoning a preview leaves nothing at all. A
  // name that already exists is reused rather than duplicated.
  const pending = pendingCampaigns(formData);
  const madeIds = new Map<number, string>();
  if (pending.length > 0) {
    const names = pending.map((c) => c.name);
    const { data: already } = await supabase
      .from("report_entities")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "ad_campaign")
      .in("name", names)
      .returns<{ id: string; name: string }[]>();

    const have = new Map((already ?? []).map((row) => [row.name, row.id]));
    const toMake = pending.filter((c) => !have.has(c.name));

    if (toMake.length > 0) {
      const { data, error } = await supabase
        .from("report_entities")
        .insert(
          toMake.map((c) => ({
            workspace_id: workspaceId,
            entity_type: "ad_campaign" as const,
            name: c.name,
            campaign_goal: c.goal,
            active: true,
          })),
        )
        .select("id, name")
        .returns<{ id: string; name: string }[]>();

      if (error) return { error: `Couldn't add those campaigns: ${error.message}` };
      // Checked, not assumed: an insert RLS refuses is not an error.
      //
      // **Unreachable today, and kept anyway.** Anyone who gets past
      // `editableWorkspace` above also passes `report_entities`' insert
      // policy, because both ask `report_can_edit` — so a mutation that
      // deletes this check fails nothing. It is here for the day the
      // two stop agreeing, which is exactly when nobody would be
      // looking.
      if (!data || data.length !== toMake.length) {
        return { error: "Those campaigns aren't yours to add." };
      }
      for (const row of data) have.set(row.name, row.id);
    }

    for (const c of pending) {
      const id = have.get(c.name);
      if (id) {
        madeIds.set(c.index, id);
        known.add(id);
      }
    }
  }

  const submitted: { key: string; entityId: string; value: number | null }[] = [];
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const match = FIELD.exec(field);
    if (!match) continue;
    const [, key, entityId] = match;
    // A field naming a campaign on another workspace, or a metric that is
    // not a campaign's, is ignored rather than written somewhere odd.
    if (!CAMPAIGN_METRICS.has(key) || !known.has(entityId)) continue;
    submitted.push({ key, entityId, value: fromInputValue(raw) });
  }

  // The figures typed against a campaign that did not exist when the
  // form was rendered, now that it does.
  for (const [field, raw] of formData.entries()) {
    if (typeof raw !== "string") continue;
    const match = NEW_FIELD.exec(field);
    if (!match) continue;
    const [, indexRaw, key] = match;
    const entityId = madeIds.get(Number(indexRaw));
    if (!entityId || !CAMPAIGN_METRICS.has(key)) continue;
    submitted.push({ key, entityId, value: fromInputValue(raw) });
  }

  if (submitted.length === 0) return { error: "Nothing to save." };

  const { error: periodError } = await supabase
    .from("report_periods")
    .upsert({ workspace_id: workspaceId, month }, {
      onConflict: "workspace_id,month",
      ignoreDuplicates: true,
    });
  if (periodError) return { error: `Couldn't open the month: ${periodError.message}` };

  const { data: existingRows, error: readError } = await supabase
    .from("report_values")
    .select("id, metric_key, entity_id")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .in("metric_key", [...CAMPAIGN_METRICS])
    .returns<{ id: string; metric_key: string; entity_id: string | null }[]>();

  if (readError) return { error: `Couldn't read this month: ${readError.message}` };

  const existing = new Map(
    (existingRows ?? []).map((row) => [`${row.metric_key}|${row.entity_id}`, row.id]),
  );

  for (const { key, entityId, value } of submitted) {
    const id = existing.get(`${key}|${entityId}`);
    const { error } = id
      ? await supabase.from("report_values").update({ value }).eq("id", id)
      : await supabase.from("report_values").insert({
          workspace_id: workspaceId,
          month,
          metric_key: key,
          entity_id: entityId,
          value,
          entered_by: access.reportUser.id,
        });

    if (error) return { error: `Couldn't save the figures: ${error.message}` };
  }

  await recordCsvImportFromForm(formData, workspaceId, month);

  revalidatePath("/reporting", "layout");
  return { notice: "Saved. Ads is up to date for this month." };
}
