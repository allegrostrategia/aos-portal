"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "./queries.ts";
import { canEdit } from "./access.ts";

/**
 * The client's social platforms: adding one, renaming one, retiring one.
 *
 * §5.2 always said "Instagram first; TikTok and LinkedIn added later
 * using the same structure". The structure was there from the start —
 * every Social Media figure hangs off a `social_platform` row — but
 * nothing could make a second row, and every reader took the first. So
 * this is the missing half, not a new shape: no migration, no new table,
 * the same `report_entities` that holds offers, funnels and campaigns.
 *
 * Retiring rather than deleting, as everywhere (rule 7): a platform they
 * have stopped posting on keeps every month it was ever part of, and
 * comes back untouched if they start again.
 */

export type PlatformState = { error?: string; notice?: string } | null;

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

  if (!mayEdit) return { error: "Your report is filled in by your Allegro team." } as const;
  return { reportUser, workspace } as const;
}

/**
 * Add a platform, or rename one.
 *
 * **Free text, not a list of the platforms we have heard of.** A fixed
 * list would be one more thing to deploy every time a client moves
 * somewhere new, and the name is only ever a label — nothing branches on
 * it except one sentence of advice on the upload card.
 */
export async function savePlatform(
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("platform_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A platform needs a name." };
  if (name.length > 40) return { error: "That name is too long for the pill it sits in." };

  const supabase = await createClient();

  if (id) {
    const { data, error } = await supabase
      .from("report_entities")
      .update({ name })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "social_platform")
      .select("id");

    if (error) return { error: named(error.message, name) };
    if (!data || data.length === 0) return { error: "That platform isn't yours to change." };

    revalidatePath("/reporting", "layout");
    return { notice: `Renamed to ${name}.` };
  }

  // **The next sort order, so the list is creation order.** Everything
  // created before today sits at 0, which makes Instagram — written by
  // the very first save — the main platform, and the main platform is
  // whose Followers figure the Overview shows.
  const { data: existing } = await supabase
    .from("report_entities")
    .select("sort_order")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "social_platform")
    .order("sort_order", { ascending: false })
    .limit(1)
    .returns<{ sort_order: number }[]>();

  const next = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("report_entities")
    .insert({
      workspace_id: workspaceId,
      entity_type: "social_platform" as const,
      name,
      sort_order: next,
    })
    .select("id");

  if (error) return { error: named(error.message, name) };
  if (!data || data.length === 0) return { error: "That platform isn't yours to add." };

  revalidatePath("/reporting", "layout");
  return { notice: `${name} added. Its figures are entered on its own tab.` };
}

/** The unique index is on (workspace, type, name), and it is worth saying which. */
function named(message: string, name: string): string {
  if (/duplicate key|unique/i.test(message)) return `There is already a platform called "${name}".`;
  return `Couldn't save the platform: ${message}`;
}

/**
 * Retire a platform, or bring it back.
 *
 * The figures stay exactly where they are — this is the same promise
 * hiding a section makes, and the same one retiring an offer makes.
 */
export async function retirePlatform(
  _prev: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("platform_id") ?? "").trim();
  if (!id) return { error: "Which platform?" };

  const supabase = await createClient();
  const restore = String(formData.get("restore") ?? "") === "1";

  // **Never the last one standing.** Social Media's figures have nowhere
  // to go without a platform, so retiring the only live one would make
  // the whole section unfillable with no sentence anywhere saying why.
  if (!restore) {
    const { data: live } = await supabase
      .from("report_entities")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "social_platform")
      .eq("active", true)
      .returns<{ id: string }[]>();

    if ((live ?? []).length <= 1) {
      return { error: "Keep one platform — Social Media's figures have to belong to one." };
    }
  }

  const { data, error } = await supabase
    .from("report_entities")
    .update({ active: restore })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "social_platform")
    .select("id");

  if (error) return { error: `Couldn't update the platform: ${error.message}` };
  if (!data || data.length === 0) return { error: "That platform isn't yours to change." };

  revalidatePath("/reporting", "layout");
  return {
    notice: restore ? "Back in use." : "Retired. Its past months are untouched.",
  };
}
