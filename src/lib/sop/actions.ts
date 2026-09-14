"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentMember, requireMember } from "@/lib/auth/member";
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
  if (!title) return { error: "Give it a name. That's what you'll look for later." };

  const videoUrl = String(formData.get("video_url") ?? "").trim();
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) {
    return { error: `“${videoUrl}” doesn't look like a link. Include the https:// at the front.` };
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
    // A build Nina named keeps her title — the guard trigger would refuse the
    // change anyway, but sending it would turn every save of the member's SOP
    // for a build into an error. Only entries the member started are theirs to
    // rename.
    const { data: existing } = await supabase
      .from("handover_pack")
      .select("source")
      .eq("id", id)
      .eq("member_id", member.id)
      .maybeSingle();
    const nameable = (existing as { source: string } | null)?.source !== "hot_seat";

    const { error } = await supabase
      .from("handover_pack")
      .update({
        ...(nameable ? { title } : {}),
        sop,
        member_edited_at: new Date().toISOString(),
      })
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

  // A template's picture goes with it. Best-effort, before the row: a stray
  // object is cheaper than a row pointing at nothing, and RLS refuses either
  // write for anyone but the owner.
  const { data: row } = await supabase
    .from("handover_pack")
    .select("source, image_path")
    .eq("id", id)
    .eq("member_id", member.id)
    .maybeSingle();
  const existing = row as { source: string; image_path: string | null } | null;
  if (existing?.source === "template" && existing.image_path) {
    await supabase.storage.from("archivio").remove([existing.image_path]);
  }

  // SOPs and templates are the member's to remove; a build is a shared record
  // and the delete policy refuses it regardless of what is sent here.
  await supabase
    .from("handover_pack")
    .delete()
    .eq("id", id)
    .eq("member_id", member.id)
    .in("source", ["member_sop", "template"]);

  revalidatePath("/stations/archivio");
  redirect(existing?.source === "template" ? "/stations/archivio?folder=templates" : "/stations/archivio");
}


/**
 * Save a template — a picture with a name (L'Editoriale §6).
 *
 * The image has already gone straight from the browser into the member's own
 * folder of the `archivio` bucket; this records the row that points at it.
 * The path is checked to be under their folder, the same belt-and-braces as
 * headshots: storage RLS would refuse the upload otherwise, but a row pointing
 * at somebody else's picture is refused here too.
 */
export async function saveTemplate(
  _prev: SopState,
  formData: FormData,
): Promise<SopState> {
  const member = await getCurrentMember();
  if (!member) return { error: "Signed out." };

  const title = String(formData.get("title") ?? "").trim();
  const imagePath = String(formData.get("image_path") ?? "").trim();
  if (!title) return { error: "Give it a name. It's what you'll look for later." };
  if (!imagePath) return { error: "Add the screenshot first." };
  if (!imagePath.startsWith(`${member.id}/`)) return { error: "That picture isn't yours." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handover_pack")
    .insert({ member_id: member.id, title, source: "template", image_path: imagePath })
    .select("id")
    .maybeSingle();

  if (error || !data) return { error: `Couldn't save that: ${error?.message ?? "unknown"}` };

  revalidatePath("/stations/archivio");
  redirect(`/stations/archivio/${(data as { id: string }).id}`);
}
