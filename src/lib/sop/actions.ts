"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { readSop } from "./template";

export type SopState = { error?: string; notice?: string } | null;

/**
 * Write or update an SOP (§8).
 *
 * A member's own, outright — no confirmation step and nothing for Nina to
 * approve. That's the difference between this and her write-up of a hot seat
 * build: she documents what was built together, they document what they run.
 *
 * Saving a half-finished one is allowed on purpose. Somebody writes the steps,
 * gets interrupted, comes back — a form that refuses until it's perfect is a
 * form people abandon with the steps still in their head.
 */
export async function saveSop(
  _prev: SopState,
  formData: FormData,
): Promise<SopState> {
  const member = await requireMember();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give it a name — that's what you'll look for later." };

  const videoUrl = String(formData.get("video_url") ?? "").trim();
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
    return { error: `“${videoUrl}” doesn't look like a link — include the https:// at the front.` };
  }

  const sop = readSop({
    trigger: formData.get("trigger"),
    outcome: formData.get("outcome"),
    owner: formData.get("owner"),
    video_url: videoUrl || null,
    // Repeated fields arrive in document order, which is the order they were
    // written in — and for steps that order is the content.
    tools: formData.getAll("tools").map(String),
    steps: formData.getAll("steps").map((text) => ({ text: String(text) })),
  });

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("handover_pack")
      .update({ title, sop, member_edited_at: new Date().toISOString() })
      .eq("id", id)
      .eq("member_id", member.id);

    if (error) return { error: `Couldn't save that: ${error.message}` };

    revalidatePath("/stations/archivio");
    return { notice: "Saved." };
  }

  const { data, error } = await supabase
    .from("handover_pack")
    .insert({
      member_id: member.id,
      title,
      source: "member_sop",
      // Their own work, written by them. `drafted_by` records who wrote it, and
      // for an SOP that is never Claude.
      drafted_by: "nina",
      sop,
      member_edited_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: `Couldn't save that: ${error?.message ?? "unknown"}` };
  }

  redirect(`/stations/archivio/${(data as { id: string }).id}`);
}

/**
 * Delete an SOP.
 *
 * The one place a member may genuinely delete something of their own. Rule 6
 * protects the record of their membership — their weekly logs, their roadmap
 * history, their status. A first draft of a process they decided not to keep
 * isn't that, and being unable to remove it would make people reluctant to
 * start one.
 */
export async function deleteSop(formData: FormData): Promise<void> {
  const member = await requireMember();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("handover_pack")
    .delete()
    .eq("id", id)
    .eq("member_id", member.id)
    .eq("source", "member_sop");

  revalidatePath("/stations/archivio");
  redirect("/stations/archivio");
}
