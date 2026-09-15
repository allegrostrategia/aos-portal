"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushForMessage } from "@/lib/push/send";
import { windowState } from "@/lib/chat/window";
import { formatSessionTime } from "@/lib/time-zone";

export type ChatState = { error?: string } | null;

/**
 * Post to a channel.
 *
 * Text, a voice note, or both. The voice file is already in storage by the time
 * this runs — the browser uploads it directly, because a Server Action body is
 * capped at a few megabytes on Vercel and audio doesn't reliably fit. Same shape
 * as library uploads, for the same reason.
 *
 * The path is checked against the sender's own folder rather than trusted. The
 * storage policy already stops anyone writing outside their own prefix, but this
 * value arrives from the browser and ends up in a row other people read — a
 * message claiming somebody else's audio would be a small forgery.
 */
export async function sendMessage(
  _prev: ChatState,
  formData: FormData,
): Promise<ChatState> {
  const member = await requireMember();

  const channelId = String(formData.get("channel_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const voicePath = String(formData.get("voice_path") ?? "").trim();
  const imagePath = String(formData.get("image_path") ?? "").trim();
  const voiceSecondsRaw = String(formData.get("voice_seconds") ?? "").trim();
  const buildId = String(formData.get("handover_pack_id") ?? "").trim();
  const consent = formData.get("testimonial_consent") === "on";

  if (!channelId) return { error: "Which channel?" };
  if (!body && !voicePath && !imagePath) return { error: "Say something first." };
  // Same rule as the audio: the picture must be in the sender's own folder. The
  // database refuses it too (chat_messages_image_is_own); this is the friendlier
  // error.
  if (imagePath && !imagePath.startsWith(`${member.id}/`)) {
    return { error: "That picture isn't yours to send." };
  }

  if (voicePath && !voicePath.startsWith(`${member.id}/`)) {
    return { error: "That audio isn't yours to send." };
  }

  const voiceSeconds = voicePath ? Math.round(Number(voiceSecondsRaw)) : null;
  if (voicePath && (!Number.isFinite(voiceSeconds) || (voiceSeconds ?? 0) <= 0)) {
    return { error: "That recording didn't come through. Try again." };
  }

  // The schema refuses consent without a build attached, which is the rule; this
  // is the friendlier version of the same refusal.
  if (consent && !buildId) {
    return {
      error:
        "Tick that only on an update about a specific build. It's consent to reuse that answer, not everything you write.",
    };
  }

  const supabase = await createClient();

  // A timed room outside its window (round 3, §A). The insert policy refuses
  // this too; this is the version that says when to come back. Admins are
  // exempt there and here.
  if (member.role !== "admin") {
    const { data: channelRow } = await supabase
      .from("chat_channels")
      .select("window_weekday, window_start, window_end")
      .eq("id", channelId)
      .maybeSingle();
    if (channelRow) {
      const state = windowState(channelRow as Parameters<typeof windowState>[0]);
      if (state.kind === "closed") {
        return {
          error: `This room is closed right now. It opens ${formatSessionTime(state.opensAt)}.`,
        };
      }
    }
  }

  const { data: inserted, error } = await supabase.from("chat_messages").insert({
    channel_id: channelId,
    member_id: member.id,
    body: body || null,
    voice_path: voicePath || null,
    image_path: imagePath || null,
    voice_seconds: voiceSeconds,
    handover_pack_id: buildId || null,
    testimonial_consent: consent,
  }).select("id").maybeSingle();

  if (error) return { error: `Couldn't send that: ${error.message}` };

  // Push to everyone else in the room, once the response is on its way.
  const newId = (inserted as { id: string } | null)?.id;
  if (newId) after(() => pushForMessage(newId));
  revalidatePath("/sociale");
  return null;
}

/**
 * Open (or reopen) the direct channel with another member.
 *
 * Redirects into it. The find-or-create is a single database call, so two people
 * clicking at the same moment land in the same conversation rather than two.
 */
export async function openDirectMessage(formData: FormData): Promise<void> {
  await requireMember();

  const otherId = String(formData.get("member_id") ?? "").trim();
  if (!otherId) return;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_direct_channel", {
    p_other_member_id: otherId,
  });

  if (error || !data) return;

  redirect(`/sociale/${data as string}`);
}

/**
 * Mark a channel read up to now.
 *
 * Called from the open thread rather than the server render, because "they have
 * seen it" is about the page being in front of them — a prefetch or a bot
 * fetching the route is not somebody reading.
 *
 * Silent on failure by design: a read marker that didn't save costs an extra
 * email, and surfacing an error about it would interrupt reading to report
 * something the member can do nothing about.
 */
export async function markChannelRead(channelId: string): Promise<void> {
  await requireMember();
  if (!channelId) return;

  const supabase = await createClient();
  await supabase.rpc("mark_channel_read", { p_channel_id: channelId });
}


/**
 * Retract a message (round 2, E4). A reversal of the standing rule, confirmed:
 * a member may delete their own sent messages; an admin may delete anyone's.
 * RLS decides which of those applies. Reactions and pins go by cascade. The
 * audio or picture behind it is removed best-effort afterwards, with the
 * service role, because the bucket has no member delete for voice notes.
 */
export async function deleteMessage(formData: FormData): Promise<void> {
  const member = await requireMember();
  const id = String(formData.get("message_id") ?? "").trim();
  const channelId = String(formData.get("channel_id") ?? "").trim();
  if (!id) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("voice_path, image_path")
    .eq("id", id)
    .maybeSingle();
  const row = data as { voice_path: string | null; image_path: string | null } | null;

  const { error } = await supabase.from("chat_messages").delete().eq("id", id);
  if (error || !row) return;

  const admin = createAdminClient();
  if (row.voice_path) await admin.storage.from("voice-messages").remove([row.voice_path]);
  if (row.image_path) await admin.storage.from("chat-images").remove([row.image_path]);

  void member;
  revalidatePath(`/sociale/${channelId}`);
  revalidatePath("/sociale", "layout");
}

/** Pin or unpin a message in its channel. Admin only; RLS refuses anyone else. */
export async function setPinned(formData: FormData): Promise<void> {
  const member = await requireMember();
  const id = String(formData.get("message_id") ?? "").trim();
  const channelId = String(formData.get("channel_id") ?? "").trim();
  const on = formData.get("pinned") === "true";
  if (!id) return;

  const supabase = await createClient();
  if (on) {
    await supabase
      .from("chat_pins")
      .upsert({ message_id: id, pinned_by: member.id }, { onConflict: "message_id", ignoreDuplicates: true });
  } else {
    await supabase.from("chat_pins").delete().eq("message_id", id);
  }
  revalidatePath(`/sociale/${channelId}`);
}
