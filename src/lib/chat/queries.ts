import "server-only";

import { createClient } from "@/lib/supabase/server";
import { REACTION_EMOJI, type ReactionEmoji, type ReactionSummary } from "@/lib/chat/reactions";

export { REACTION_EMOJI, type ReactionEmoji, type ReactionSummary };

export type Channel = {
  id: string;
  kind: "group" | "direct";
  slug: string | null;
  name: string | null;
  description: string | null;
  /** The posting window, if the room has one (round 3, §A). See lib/chat/window. */
  window_weekday: number | null;
  window_start: string | null;
  window_end: string | null;
};

export type ChatMessage = {
  id: string;
  member_id: string;
  body: string | null;
  voice_path: string | null;
  voice_seconds: number | null;
  image_path: string | null;
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
    .select("id, kind, slug, name, description, window_weekday, window_start, window_end")
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
    .select("id, kind, slug, name, description, window_weekday, window_start, window_end")
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
      "id, member_id, body, voice_path, voice_seconds, image_path, handover_pack_id, created_at",
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


/**
 * Reactions for a set of messages, summarised per message: each emoji's count
 * and whether the current member is among them. RLS scopes rows to messages
 * the member can see, so this is safe to call with any ids the page holds.
 */
export async function getReactions(
  messageIds: string[],
  meId: string,
): Promise<Map<string, ReactionSummary[]>> {
  const out = new Map<string, ReactionSummary[]>();
  if (messageIds.length === 0) return out;

  const supabase = await createClient();
  const { data } = await supabase
    .from("message_reactions")
    .select("message_id, member_id, emoji")
    .in("message_id", messageIds);

  const rows = (data ?? []) as { message_id: string; member_id: string; emoji: ReactionEmoji }[];

  for (const row of rows) {
    const list = out.get(row.message_id) ?? [];
    let entry = list.find((e) => e.emoji === row.emoji);
    if (!entry) {
      entry = { emoji: row.emoji, count: 0, mine: false };
      list.push(entry);
    }
    entry.count++;
    if (row.member_id === meId) entry.mine = true;
    out.set(row.message_id, list);
  }

  // Fixed order, so the same four never jump around between messages.
  for (const list of out.values()) {
    list.sort((a, b) => REACTION_EMOJI.indexOf(a.emoji) - REACTION_EMOJI.indexOf(b.emoji));
  }
  return out;
}

export type ChannelPreview = {
  body: string | null;
  voice: boolean;
  memberId: string;
  createdAt: string;
};

/**
 * The latest message in each channel, for the room list's preview line. One
 * query for all channels rather than one per row: the list is small, but a
 * round trip per room is the shape that gets slow the day it isn't.
 */
export async function getChannelPreviews(
  channelIds: string[],
): Promise<Map<string, ChannelPreview>> {
  const out = new Map<string, ChannelPreview>();
  if (channelIds.length === 0) return out;

  const supabase = await createClient();
  // Newest first across every channel; the first row seen per channel wins.
  // Bounded, because a member in many rooms would otherwise pull the world.
  const { data } = await supabase
    .from("chat_messages")
    .select("channel_id, member_id, body, voice_path, created_at")
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false })
    .limit(channelIds.length * 20);

  for (const row of (data ?? []) as {
    channel_id: string;
    member_id: string;
    body: string | null;
    voice_path: string | null;
    created_at: string;
  }[]) {
    if (out.has(row.channel_id)) continue;
    out.set(row.channel_id, {
      body: row.body,
      voice: Boolean(row.voice_path),
      memberId: row.member_id,
      createdAt: row.created_at,
    });
  }
  return out;
}

/** When the member last opened each channel, for the unread dot. */
export async function getLastReads(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("chat_reads").select("channel_id, last_read_at");
  return new Map(
    ((data ?? []) as { channel_id: string; last_read_at: string }[]).map((r) => [
      r.channel_id,
      r.last_read_at,
    ]),
  );
}

/** The other participant of each direct channel, by id — for their headshot. */
export async function getDirectPartnerIds(
  channelIds: string[],
  meId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (channelIds.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_participants")
    .select("channel_id, member_id")
    .in("channel_id", channelIds);
  for (const row of (data ?? []) as { channel_id: string; member_id: string }[]) {
    if (row.member_id !== meId) out.set(row.channel_id, row.member_id);
  }
  return out;
}


/** The pinned messages in a channel, newest pin first. */
export async function getPins(channelId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_pins")
    .select("pinned_at, chat_messages!inner(id, channel_id, member_id, body, voice_path, voice_seconds, image_path, handover_pack_id, created_at)")
    .eq("chat_messages.channel_id", channelId)
    .order("pinned_at", { ascending: false });

  // Supabase types an embedded row as an array; it is one row here.
  const rows = ((data ?? []) as unknown as { chat_messages: Omit<ChatMessage, "authorName"> & { channel_id: string } }[])
    .map((r) => r.chat_messages);
  const names = await resolveNames(rows.map((r) => r.member_id));
  return rows.map((row) => ({ ...row, authorName: names.get(row.member_id) ?? "A member" }));
}

/** Who the coach is, so her messages can be marked. Ids only. */
export async function getCoachIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("coach_member_ids");
  return new Set((Array.isArray(data) ? data : []) as string[]);
}

export type SearchHit = ChatMessage & { channelId: string; channelName: string; channelHref: string };

/**
 * Search across every channel the member can see (round 2, E3). The tsvector
 * index does the matching; RLS does the scoping, as for every other read.
 */
export async function searchMessages(query: string, limit = 50): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("id, channel_id, member_id, body, voice_path, voice_seconds, image_path, handover_pack_id, created_at, chat_channels(kind, slug, name)")
    .textSearch("search_vector", trimmed, { type: "websearch" })
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as unknown as (Omit<ChatMessage, "authorName"> & {
    channel_id: string;
    chat_channels: { kind: "group" | "direct"; slug: string | null; name: string | null } | null;
  })[];
  const meId = (await supabase.auth.getUser()).data.user?.id ?? "";
  const directIds = rows.filter((r) => r.chat_channels?.kind === "direct").map((r) => r.channel_id);
  const [names, partners] = await Promise.all([
    resolveNames(rows.map((r) => r.member_id)),
    getDirectPartners([...new Set(directIds)], meId),
  ]);

  return rows.map((row) => {
    const ch = row.chat_channels;
    const direct = ch?.kind === "direct";
    return {
      ...row,
      authorName: names.get(row.member_id) ?? "A member",
      channelId: row.channel_id,
      channelName: direct ? (partners.get(row.channel_id) ?? "Direct message") : (ch?.name ?? "Channel"),
      channelHref: direct ? `/sociale/${row.channel_id}` : `/sociale/${ch?.slug ?? row.channel_id}`,
    };
  });
}
