"use server";

import { revalidatePath } from "next/cache";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

/**
 * Register or remove this device's push subscription. The member's own
 * session writes their own row; the endpoint is unique, so a device that
 * subscribes again replaces itself and comes back from expired.
 */
export async function savePushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const member = await requireMember();
  if (!input.endpoint || !input.keys?.p256dh || !input.keys?.auth) {
    return { ok: false, message: "That subscription is incomplete." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      member_id: member.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      user_agent: input.userAgent?.slice(0, 200) ?? null,
      expired_at: null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, message: error.message };

  revalidatePath("/you");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await requireMember();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  revalidatePath("/you");
}
