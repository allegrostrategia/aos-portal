import "server-only";

import { createClient } from "@/lib/supabase/server";

export type DirectoryEntry = {
  memberId: string;
  displayName: string;
  title: string | null;
  bio: string | null;
  links: { label: string; url: string }[];
  headshotUrl: string | null;
};

const HEADSHOT_URL_SECONDS = 60 * 60;

/**
 * The member directory (§10).
 *
 * Free-text across name, title and bio only. No category or dropdown filters,
 * deliberately — those would mean surfacing the business-model data from the
 * audit, which §10 keeps out of the directory entirely and §9 keeps out of
 * pairing. The `search_vector` column was built for exactly this in Step 1.
 *
 * `websearch_to_tsquery` rather than raw tsquery: it takes what a person
 * actually types, quoted phrases and all, and can't be made to throw by a stray
 * apostrophe. A search box that errors on "founder's" would be worse than one
 * that returns nothing.
 *
 * RLS returns only completed listings, so a half-filled profile never appears as
 * an empty card, and only to members with portal access.
 */
export async function searchDirectory(query: string): Promise<DirectoryEntry[]> {
  const supabase = await createClient();

  let request = supabase
    .from("member_profiles")
    .select("member_id, display_name, title, bio, links, headshot_path")
    .order("display_name");

  const trimmed = query.trim();
  if (trimmed) {
    request = request.textSearch("search_vector", trimmed, { type: "websearch" });
  }

  const { data } = await request;

  const rows = (data ?? []) as {
    member_id: string;
    display_name: string;
    title: string | null;
    bio: string | null;
    links: { label: string; url: string }[] | null;
    headshot_path: string | null;
  }[];

  // The headshots bucket is private but readable by anyone with portal access,
  // so the member's own session can sign these — no service role needed. Signed
  // in one batch rather than per card, which would be a round trip each.
  const paths = rows.map((r) => r.headshot_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();

  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("headshots")
      .createSignedUrls(paths, HEADSHOT_URL_SECONDS);

    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }

  return rows.map((row) => ({
    memberId: row.member_id,
    displayName: row.display_name,
    title: row.title,
    bio: row.bio,
    links: Array.isArray(row.links) ? row.links : [],
    headshotUrl: row.headshot_path ? (signed.get(row.headshot_path) ?? null) : null,
  }));
}

/**
 * Signed headshot URLs for a set of members, keyed by member id.
 *
 * The same batch-signing as the directory search, lifted out so the You screen,
 * pairing and chat can show real faces without each re-deriving it. Members
 * without a headshot are simply absent from the map.
 */
export async function getHeadshotUrls(memberIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (memberIds.length === 0) return out;

  const supabase = await createClient();
  const { data } = await supabase
    .from("member_profiles")
    .select("member_id, headshot_path")
    .in("member_id", memberIds)
    .not("headshot_path", "is", null);

  const rows = (data ?? []) as { member_id: string; headshot_path: string }[];
  if (rows.length === 0) return out;

  const { data: urls } = await supabase.storage
    .from("headshots")
    .createSignedUrls(
      rows.map((r) => r.headshot_path),
      HEADSHOT_URL_SECONDS,
    );

  const byPath = new Map<string, string>();
  for (const entry of urls ?? []) {
    if (entry.path && entry.signedUrl) byPath.set(entry.path, entry.signedUrl);
  }
  for (const row of rows) {
    const url = byPath.get(row.headshot_path);
    if (url) out.set(row.member_id, url);
  }
  return out;
}

export type OwnListing = "complete" | "draft" | "none";

/**
 * Whether the current member is actually in the directory.
 *
 * Asked separately rather than inferred from the search results, because a
 * search that doesn't match your own listing would otherwise look like not being
 * listed at all.
 *
 * Relies on the policy letting an owner read their own row complete or not —
 * the same one that lets somebody come back and finish a half-written listing.
 */
export async function getOwnListing(memberId: string): Promise<OwnListing> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("member_profiles")
    .select("completed_at")
    .eq("member_id", memberId)
    .maybeSingle();

  const row = data as { completed_at: string | null } | null;
  if (!row) return "none";
  return row.completed_at ? "complete" : "draft";
}
