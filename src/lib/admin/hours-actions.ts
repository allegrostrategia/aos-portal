"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type HoursState = { error?: string; notice?: string } | null;

/**
 * What a member's builds are worth (§2).
 *
 * A build lives in the handover pack and its rate lives in a dated history
 * beside it, so this creates both: there is no such thing as a rate without a
 * build to attach it to.
 *
 * This is a deliberately small piece of Step 9's territory, built because Step
 * 10 cannot function without it — nothing accrues until a build with a rate
 * exists. The handover pack proper (the write-up, the member's own edit, export)
 * is still Step 9 and still unbuilt.
 */
export async function addBuild(
  _prev: HoursState,
  formData: FormData,
): Promise<HoursState> {
  await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const hoursRaw = String(formData.get("hours_per_week") ?? "").trim();
  const from = String(formData.get("effective_from") ?? "").trim();

  if (!memberId) return { error: "Which member?" };
  if (!title) return { error: "Give the build a name — it's what the member sees." };

  const hours = Number(hoursRaw);
  if (!hoursRaw || !Number.isFinite(hours) || hours < 0) {
    return { error: "Hours per week should be a number, like 2.5." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return { error: "When does it start earning?" };
  }

  const supabase = await createClient();

  const { data: created, error: buildError } = await supabase
    .from("handover_pack")
    .insert({ member_id: memberId, title, source: "hot_seat", drafted_by: "nina" })
    .select("id")
    .maybeSingle();

  if (buildError || !created) {
    return { error: `Couldn't add that build: ${buildError?.message ?? "unknown"}` };
  }

  const { error: rateError } = await supabase.rpc("set_build_rate", {
    p_handover_pack_id: (created as { id: string }).id,
    p_hours_per_week: hours,
    p_effective_from: from,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });

  if (rateError) return { error: rateError.message };

  revalidatePath("/", "layout");
  return {
    notice: `Added. It earns ${hours} hrs in every qualifying week from ${from}.`,
  };
}

/**
 * Revise or retire a rate.
 *
 * Both go through the database functions rather than an update from here, so
 * closing one period and opening the next stays a single operation. A revision
 * that half-succeeded would leave a build with no running rate at all — earning
 * nothing from the next week on, which nobody would notice for a month.
 */
export async function changeBuildRate(
  _prev: HoursState,
  formData: FormData,
): Promise<HoursState> {
  await requireAdmin();

  const packId = String(formData.get("handover_pack_id") ?? "").trim();
  const intent = String(formData.get("intent") ?? "");
  const date = String(formData.get("effective_date") ?? "").trim();

  if (!packId) return { error: "Which build?" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };

  const supabase = await createClient();

  if (intent === "retire") {
    const { error } = await supabase.rpc("retire_build_rate", {
      p_handover_pack_id: packId,
      p_effective_until: date,
    });
    if (error) return { error: error.message };

    revalidatePath("/", "layout");
    return {
      notice:
        "Retired. Everything it already earned stays in the ledger — retiring never takes hours back.",
    };
  }

  const hoursRaw = String(formData.get("hours_per_week") ?? "").trim();
  const hours = Number(hoursRaw);
  if (!hoursRaw || !Number.isFinite(hours) || hours < 0) {
    return { error: "Hours per week should be a number, like 2.5." };
  }

  const { error } = await supabase.rpc("set_build_rate", {
    p_handover_pack_id: packId,
    p_hours_per_week: hours,
    p_effective_from: date,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { notice: `Now ${hours} hrs a week from ${date}. Weeks before that are untouched.` };
}
