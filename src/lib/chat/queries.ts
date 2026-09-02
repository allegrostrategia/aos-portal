import "server-only";

import { createClient } from "@/lib/supabase/server";

export type Channel = {
  id: string;
  kind: "group" | "direct";
  slug: string | null;
  name: string | null;
  description: string | null;
};

export type ChatMessage = {
  id: string;
  member_id: string;
  body: string | null;
  voice_path: string | null;
  voice_seconds: number | null;
  handover_pack_id: string | null;
  created_at: string;
  authorName: string;
};

/**
 * Names for a set of members.
 *
 * Through `display_names()` rather than a join to `members`, whose rows are
 * readable only by their owner — joining it silently returns null for everybody
 * else, which is how chat ended up labelling half its messages "A member".
 */
export async function resolveNames(
  memberIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(memberIds)];
  if (unique.length === 0) return names;

  const supabase = await createClient();
  const { data } = await supabase.rpc("display_names", { p_member_ids: unique });

  for (const row of (data ?? []) as { member_id: string; display_name: string }[]) {
    if (row.display_name) names.set(row.member_id, row.display_name);
  }

  return names;
}

/**
 * The channels a member can reach.
 *
 * RLS decides, through `can_see_channel()`: the open channels for anyone with
 * portal access, plus the direct channels they're actually in. No status
 * branching here — the policy already expresses it, and expressing it twice is
 * how the two versions drift.
 */
export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("chat_channels")
    .select("id, kind, slug, name, description")
    .order("kind")
    .order("sort_order");

  return (data ?? []) as Channel[];
}

/** A group channel by slug, or a direct one by id — whichever the URL carries. */
export async function getChannel(handle: string): Promise<Channel | null> {
  const supabase = await createClient();
  const isUuid = /^[0-9a-f-]{36}$/i.test(handle);

  const { data } = await supabase
    .from("chat_channels")
    .select("id, kind, slug, name, description")
    .eq(isUuid ? "id" : "slug", handle)
    .maybeSingle();

  return (data as Channel | null) ?? null;
}

/**
 * A channel's messages, oldest last.
 *
 * Read newest-first with a limit so a long channel doesn't fetch everything,
 * then reversed for display — a conversation reads downwards.
 */
export async function getMessages(
  channelId: string,
  limit = 100,
): Promise<ChatMessage[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("chat_messages")
    .select(
      "id, member_id, body, voice_path, voice_seconds, handover_pack_id, created_at",
    )
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = ((data ?? []) as Omit<ChatMessage, "authorName">[]).reverse();
  const names = await resolveNames(rows.map((r) => r.member_id));

  return rows.map((row) => ({
    ...row,
    // "A member" is the honest answer for someone who has since been removed,
    // not the everyday case it had become.
    authorName: names.get(row.member_id) ?? "A member",
  }));
}

/** Who the other person is, for naming a direct channel in the UI. */
export async function getDirectPartners(
  channelIds: string[],
  meId: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (channelIds.length === 0) return names;

  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_participants")
    .select("channel_id, member_id")
    .in("channel_id", channelIds);

  const rows = ((data ?? []) as { channel_id: string; member_id: string }[])
    .filter((row) => row.member_id !== meId);

  const byMember = await resolveNames(rows.map((r) => r.member_id));

  for (const row of rows) {
    names.set(row.channel_id, byMember.get(row.member_id) ?? "A member");
  }

  return names;
}
