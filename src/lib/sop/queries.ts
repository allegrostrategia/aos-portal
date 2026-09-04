import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readSop, type Sop } from "./template";

export type ArchivioEntry = {
  id: string;
  title: string;
  body: string | null;
  /** Null on a build Nina hasn't written up yet — the entry shows, the prose doesn't. */
  confirmed_at: string | null;
  source: "hot_seat" | "member_sop" | "ai_sop";
  sop: Sop | null;
  created_at: string;
  member_edited_at: string | null;
};

/**
 * Everything in a member's Archivio (§8).
 *
 * Two genuinely different things in one list: what Nina wrote up from a hot seat
 * build, and what the member documented themselves. Kept in one table because
 * they're the same thing to the person reading — this is what I've built — and
 * separated by `source` where the difference matters, which is who may edit it.
 *
 * RLS gates on `has_portal_access()`, not on active status: a member who
 * cancelled and rejoined sits in onboarding while their own past work stays
 * theirs.
 */
export async function getArchivio(memberId: string): Promise<ArchivioEntry[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("handover_pack")
    .select("id, title, body, source, sop, confirmed_at, created_at, member_edited_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as (Omit<ArchivioEntry, "sop"> & { sop: unknown })[]).map(
    (row) => ({
      ...row,
      sop: row.source === "member_sop" ? readSop(row.sop) : null,
    }),
  );
}

export async function getArchivioEntry(
  memberId: string,
  id: string,
): Promise<ArchivioEntry | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("handover_pack")
    .select("id, title, body, source, sop, confirmed_at, created_at, member_edited_at")
    .eq("id", id)
    .eq("member_id", memberId)
    .maybeSingle();

  if (!data) return null;
  const row = data as Omit<ArchivioEntry, "sop"> & { sop: unknown };

  return { ...row, sop: row.source === "member_sop" ? readSop(row.sop) : null };
}
