"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

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
  const voiceSecondsRaw = String(formData.get("voice_seconds") ?? "").trim();
  const buildId = String(formData.get("handover_pack_id") ?? "").trim();
  const consent = formData.get("testimonial_consent") === "on";

  if (!channelId) return { error: "Which channel?" };
  if (!body && !voicePath) return { error: "Say something first." };

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
        "Tick that only on an update about a specific build — it's consent to reuse that answer, not everything you write.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").insert({
    channel_id: channelId,
    member_id: member.id,
    body: body || null,
    voice_path: voicePath || null,
    voice_seconds: voiceSeconds,
    handover_pack_id: buildId || null,
    testimonial_consent: consent,
  });

  if (error) return { error: `Couldn't send that: ${error.message}` };

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
