"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ENTRY_CATEGORIES } from "./categories.ts";
import { requireReportUser } from "@/lib/auth/report";
import { withSaved, type SavedKey } from "./saved-notice.ts";

/**
 * A member's own report settings (§8.1, §10.3).
 *
 * **Nothing here checks who may do it**, because the database already
 * does, twice over and better than this file could:
 *
 *   · `report_workspaces_update_editors` admits only `report_can_edit`,
 *     which is false for a retainer client by design — they view and
 *     comment, Allegro enters.
 *   · `guard_report_workspace_admin_fields` refuses a change to `kind`,
 *     `owner_user_id`, `access_end_date` or `first_month` from anybody
 *     but an admin, so a member cannot promote their own workspace or
 *     extend their own access by posting a field that is not on screen.
 *
 * Which means the columns below are exactly the ones a member is allowed
 * to own, and that is enforced where it counts rather than here.
 */

export type SettingsState = { error?: string } | null;

const BACK = /^\/reporting\/settings(\?[^#]*)?$/;

function done(formData: FormData, key: SavedKey): never {
  const asked = String(formData.get("return_to") ?? "");
  revalidatePath("/reporting", "layout");
  redirect(withSaved(BACK.test(asked) ? asked : "/reporting/settings", key));
}

/** The business, the money, and the three answers the benchmark prompt asks. */
export async function saveReportSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const businessName = String(formData.get("business_name") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const rateRaw = String(formData.get("target_hourly_rate") ?? "").trim();

  if (!workspaceId) return { error: "That was missing something. Reload and try again." };
  if (!businessName) return { error: "What is the business called?" };
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: "Currency should be a three-letter code, like GBP." };
  }

  let rate: number | null = null;
  if (rateRaw !== "") {
    const parsed = Number(rateRaw.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { error: "An hourly rate should be a number above zero, or blank." };
    }
    rate = parsed;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_workspaces")
    .update({
      business_name: businessName,
      currency,
      target_hourly_rate: rate,
      // Blank clears them: these are prompts for a benchmark she pastes
      // in, not figures, so an empty one is a real answer.
      benchmark_business_description:
        String(formData.get("benchmark_business_description") ?? "").trim() || null,
      benchmark_main_offers: String(formData.get("benchmark_main_offers") ?? "").trim() || null,
      benchmark_country: String(formData.get("benchmark_country") ?? "").trim() || null,
    })
    .eq("id", workspaceId)
    .select("id");

  if (error) return { error: `Couldn't save that: ${error.message}` };
  // Checked, not assumed: an update refused by RLS is not an error, and a
  // silent no-op looks exactly like success.
  if (!data || data.length === 0) return { error: "That report isn't yours to change." };

  done(formData, "settings");
}

/**
 * Which sections she uses (§8.1).
 *
 * **Display only, and that is the whole point** (Dom, 9 Oct). Hiding a
 * section deletes nothing: the figures stay in `report_values`, the
 * targets stay, un-hiding brings all of it back exactly as it was, and a
 * figure pulled into another section keeps working while its own section
 * is hidden — Offers' revenue still reaches Financials. Rule 7, applied
 * to a toggle.
 *
 * The form sends what is SHOWN rather than what is hidden, because a
 * checkbox that is off sends nothing at all: reading "hidden" off absent
 * boxes would make an unticked box indistinguishable from a field that
 * was never rendered.
 */
export async function saveHiddenCategories(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  if (!workspaceId) return { error: "That was missing something. Reload and try again." };

  const shown = new Set(formData.getAll("shown").map(String));
  const hidden = ENTRY_CATEGORIES.filter((c) => !shown.has(c.key)).map((c) => c.key);

  if (hidden.length === ENTRY_CATEGORIES.length) {
    return { error: "Keep at least one section — a report of nothing has nothing to say." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_workspaces")
    .update({ hidden_categories: hidden })
    .eq("id", workspaceId)
    .select("id");

  if (error) return { error: `Couldn't save that: ${error.message}` };
  if (!data || data.length === 0) return { error: "That report isn't yours to change." };

  done(formData, "sections");
}
