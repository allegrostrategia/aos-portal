"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { getCurrentMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { REACTION_EMOJI, type ReactionEmoji } from "@/lib/chat/reactions";
import { pushForReaction } from "@/lib/push/send";

/**
 * Toggle one of the four reactions on a message.
 *
 * The member's own session writes it; RLS decides whether the message is one
 * they can see. The emoji set is checked here too, but the database's check
 * constraint is the real guard — this is just a friendlier error.
 */
export async function toggleReaction(
  messageId: string,
  emoji: ReactionEmoji,
  on: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!REACTION_EMOJI.includes(emoji)) return { ok: false, message: "Not one of the four." };

  const member = await getCurrentMember();
  if (!member) return { ok: false, message: "Not signed in." };

  const supabase = await createClient();
  const { error } = on
    ? await supabase
        .from("message_reactions")
        .upsert(
          { message_id: messageId, member_id: member.id, emoji },
          { onConflict: "message_id,member_id,emoji", ignoreDuplicates: true },
        )
    : await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("member_id", member.id)
        .eq("emoji", emoji);

  if (error) return { ok: false, message: "That didn't save. Try again in a moment." };

  // Only when a reaction is added, and only to the message's author.
  if (on) after(() => pushForReaction(messageId, member.id, emoji));

  revalidatePath("/sociale", "layout");
  return { ok: true };
}
