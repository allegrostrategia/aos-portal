"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { firstMondayOfNextMonth } from "@/lib/onboarding/cadence";
import { snapStart } from "./calendar";
import { ACTION_BUCKETS, readRoadmap, type ActionBucket, type RoadmapMonth } from "./shape";

/**
 * La Strada's edits (brief, 18 Sep 2026). Nina edits on the page the member
 * sees; every change saves on its own, into the roadmap's stored structure.
 * No separate editor, no draft-then-rebuild.
 *
 * One thing is kept from the old editor, because it protects a moment: a
 * roadmap Nina starts is a DRAFT until she publishes it. The member sees
 * nothing until then, the onboarding step "Your roadmap arrives" ticks on
 * publish, and the 1:1 stays the reveal. After that, every edit is live.
 *
 * **Action ids are preserved through edits.** The pencil edits the action in
 * place; the weekly log's ticks and the member's notes key off the id, and a
 * reworded action here is the same commitment said better, not a new one.
 * (The old editor took the opposite view for whole-plan re-saves, where a
 * rewording could not be told from a replacement.)
 */

export type StradaState = { error?: string; notice?: string } | null;

type StoredAction = {
  id: string;
  label: string;
  training_id: string | null;
  week: number | null;
  bucket: ActionBucket | null;
};
type StoredFocus = { id: string; title: string; station_slug: string | null; actions: StoredAction[] };
type StoredMonth = { month: number; title: string; focuses: StoredFocus[] };

function toStored(months: RoadmapMonth[]): StoredMonth[] {
  return months.map((m) => ({
    month: m.month,
    title: m.title,
    focuses: m.focuses.map((f) => ({
      id: f.id,
      title: f.title,
      station_slug: f.stationSlug,
      actions: f.actions.map((a) => ({
        id: a.id,
        label: a.label,
        training_id: a.trainingId,
        week: a.week,
        bucket: a.bucket,
      })),
    })),
  }));
}

async function loadForEdit(roadmapId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roadmap")
    .select("id, member_id, phases, confirmed_at")
    .eq("id", roadmapId)
    .maybeSingle();
  const row = data as { id: string; member_id: string; phases: unknown; confirmed_at: string | null } | null;
  if (!row) return null;
  return { supabase, row, months: toStored(readRoadmap(row.phases)) };
}

async function store(roadmapId: string, months: StoredMonth[]): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("roadmap")
    .update({ phases: months.sort((a, b) => a.month - b.month), drafted_by: "nina" })
    .eq("id", roadmapId);
  return error ? error.message : null;
}

function monthIn(months: StoredMonth[], month: number): StoredMonth {
  let m = months.find((x) => x.month === month);
  if (!m) {
    m = { month, title: "", focuses: [] };
    months.push(m);
  }
  return m;
}

/** The month's first focus, made if the month has none: where new actions go. */
function focusIn(month: StoredMonth): StoredFocus {
  if (month.focuses.length === 0) {
    month.focuses.push({ id: `f-${month.month}-${crypto.randomUUID().slice(0, 8)}`, title: "", station_slug: null, actions: [] });
  }
  return month.focuses[0];
}

function done(memberId: string) {
  revalidatePath("/roadmap");
  revalidatePath("/piazza");
  revalidatePath("/log");
  revalidatePath(`/admin/members/${memberId}`);
}

/**
 * Start a member's roadmap: a draft with month 1 starting the first Monday of
 * next month. Nothing to see for the member until it's published.
 */
export async function startRoadmap(formData: FormData): Promise<void> {
  await requireAdmin();
  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) return;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("roadmap").select("id").eq("member_id", memberId).eq("is_current", true).maybeSingle();
  if (existing) return;

  const { count } = await supabase
    .from("roadmap").select("id", { count: "exact", head: true }).eq("member_id", memberId);

  await supabase.from("roadmap").insert({
    member_id: memberId,
    phases: [],
    reason: (count ?? 0) === 0 ? "onboarding" : "monthly_repoint",
    drafted_by: "nina",
    is_current: true,
    starts_on: firstMondayOfNextMonth(new Date().toISOString().slice(0, 10)),
  });
  done(memberId);
}

/** Publish: from here the member sees it, and every edit is live. */
export async function publishRoadmap(_prev: StradaState, formData: FormData): Promise<StradaState> {
  const admin = await requireAdmin();
  const roadmapId = String(formData.get("roadmap_id") ?? "").trim();
  const loaded = await loadForEdit(roadmapId);
  if (!loaded) return { error: "No roadmap to publish." };
  if (loaded.months.every((m) => m.focuses.every((f) => f.actions.length === 0))) {
    return { error: "Put at least one action in before publishing. An empty plan is not a reveal." };
  }
  const { error } = await loaded.supabase
    .from("roadmap")
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: admin.id })
    .eq("id", roadmapId);
  if (error) return { error: `Couldn't publish: ${error.message}` };
  done(loaded.row.member_id);
  return { notice: "Published. It's their La Strada now, and their onboarding step ticks." };
}

/** Month 1's first Monday. Snapped to the first Monday of whatever month is given. */
export async function setStartsOn(_prev: StradaState, formData: FormData): Promise<StradaState> {
  await requireAdmin();
  const roadmapId = String(formData.get("roadmap_id") ?? "").trim();
  const date = String(formData.get("starts_on") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  const loaded = await loadForEdit(roadmapId);
  if (!loaded) return { error: "No roadmap." };
  const { error } = await loaded.supabase.from("roadmap").update({ starts_on: snapStart(date) }).eq("id", roadmapId);
  if (error) return { error: `Couldn't save that: ${error.message}` };
  done(loaded.row.member_id);
  return { notice: "Saved. Week 1 is the first Monday of that month." };
}

/** A month's theme ("Foundations"). Makes the month if it doesn't exist yet. */
export async function setMonthTitle(_prev: StradaState, formData: FormData): Promise<StradaState> {
  await requireAdmin();
  const roadmapId = String(formData.get("roadmap_id") ?? "").trim();
  const month = Number(formData.get("month"));
  const title = String(formData.get("title") ?? "").trim();
  if (!Number.isInteger(month) || month < 1 || month > 6) return { error: "Which month?" };
  const loaded = await loadForEdit(roadmapId);
  if (!loaded) return { error: "No roadmap." };
  monthIn(loaded.months, month).title = title;
  const err = await store(roadmapId, loaded.months);
  if (err) return { error: `Couldn't save that: ${err}` };
  done(loaded.row.member_id);
  return null;
}

/** Add an action to a week, or edit one in place (same id). */
export async function upsertAction(_prev: StradaState, formData: FormData): Promise<StradaState> {
  await requireAdmin();
  const roadmapId = String(formData.get("roadmap_id") ?? "").trim();
  const month = Number(formData.get("month"));
  const weekRaw = String(formData.get("week") ?? "").trim();
  const week = weekRaw ? Number(weekRaw) : null;
  const actionId = String(formData.get("action_id") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const bucketRaw = String(formData.get("bucket") ?? "").trim();
  const trainingId = String(formData.get("training_id") ?? "").trim() || null;

  if (!Number.isInteger(month) || month < 1 || month > 6) return { error: "Which month?" };
  if (week !== null && (!Number.isInteger(week) || week < 1 || week > 5)) return { error: "Which week?" };
  if (!label) return { error: "Say what they actually do." };
  const bucket = (ACTION_BUCKETS as readonly string[]).includes(bucketRaw) ? (bucketRaw as ActionBucket) : null;

  const loaded = await loadForEdit(roadmapId);
  if (!loaded) return { error: "No roadmap." };

  if (actionId) {
    let found: StoredAction | null = null;
    let from: StoredFocus | null = null;
    for (const m of loaded.months) for (const f of m.focuses) {
      const a = f.actions.find((x) => x.id === actionId);
      if (a) { found = a; from = f; }
    }
    if (!found || !from) return { error: "That action isn't there any more." };
    found.label = label;
    found.bucket = bucket;
    found.training_id = trainingId;
    found.week = week;
    // Moved to another month: carry it across, id and all.
    const target = monthIn(loaded.months, month);
    if (!target.focuses.includes(from)) {
      from.actions = from.actions.filter((x) => x.id !== actionId);
      focusIn(target).actions.push(found);
    }
  } else {
    focusIn(monthIn(loaded.months, month)).actions.push({
      id: crypto.randomUUID(),
      label,
      training_id: trainingId,
      week,
      bucket,
    });
  }

  const err = await store(roadmapId, loaded.months);
  if (err) return { error: `Couldn't save that: ${err}` };
  done(loaded.row.member_id);
  return null;
}

export async function deleteAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const roadmapId = String(formData.get("roadmap_id") ?? "").trim();
  const actionId = String(formData.get("action_id") ?? "").trim();
  const loaded = await loadForEdit(roadmapId);
  if (!loaded || !actionId) return;
  for (const m of loaded.months) for (const f of m.focuses) {
    f.actions = f.actions.filter((a) => a.id !== actionId);
  }
  await store(roadmapId, loaded.months);
  done(loaded.row.member_id);
}

/**
 * The member's tick on an action (or Nina's, from edit mode, on their
 * behalf). A state of the action, overriding what the weekly log implies.
 */
export async function setActionDone(roadmapId: string, actionId: string, isDone: boolean): Promise<{ ok: boolean }> {
  const me = await requireMember();
  if (!roadmapId || !actionId) return { ok: false };
  const supabase = await createClient();

  // Whose roadmap: the member's own, or, for an admin, the roadmap's owner.
  const { data } = await supabase.from("roadmap").select("member_id").eq("id", roadmapId).maybeSingle();
  const owner = (data as { member_id: string } | null)?.member_id;
  if (!owner) return { ok: false };
  if (owner !== me.id && me.role !== "admin") return { ok: false };

  const { error } = await supabase
    .from("roadmap_action_ticks")
    .upsert({ roadmap_id: roadmapId, member_id: owner, action_id: actionId, done: isDone }, { onConflict: "roadmap_id,action_id" });
  if (error) return { ok: false };
  done(owner);
  return { ok: true };
}

/** "Off the itinerary": the member's note for a month. Empty clears it. */
export async function saveMonthNote(_prev: StradaState, formData: FormData): Promise<StradaState> {
  const me = await requireMember();
  const roadmapId = String(formData.get("roadmap_id") ?? "").trim();
  const month = Number(formData.get("month"));
  const body = String(formData.get("body") ?? "").trim();
  if (!roadmapId || !Number.isInteger(month)) return { error: "Which month?" };
  const supabase = await createClient();

  const { error } = body
    ? await supabase
        .from("roadmap_month_notes")
        .upsert({ roadmap_id: roadmapId, member_id: me.id, month, body }, { onConflict: "roadmap_id,month" })
    : await supabase.from("roadmap_month_notes").delete().eq("roadmap_id", roadmapId).eq("month", month);
  if (error) return { error: `Couldn't save that: ${error.message}` };
  revalidatePath("/roadmap");
  return { notice: body ? "Saved." : "Cleared." };
}
