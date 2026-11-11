import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TopPost, PostType } from "./top-posts.ts";

/**
 * A month's top posts for one platform, in rank order.
 *
 * Its own file rather than more of `queries.ts`, which is already the
 * longest module here, and because the shape it returns is the one the
 * card and the entry form both take — stored columns on one side,
 * camelCase on the other, converted once.
 *
 * RLS does the rest: a retainer client sees them when the month is
 * published and not before, which is the policy every other piece of
 * month content wears.
 */

interface Row {
  id: string;
  rank: number;
  url: string;
  posted_on: string | null;
  post_type: PostType | null;
  reach: number | null;
  views: number | null;
  likes_plus_comments: number | null;
  saves: number | null;
  shares: number | null;
}

export async function getTopPosts(
  workspaceId: string,
  month: string,
  platformId: string | null,
): Promise<TopPost[]> {
  if (!platformId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("report_top_posts")
    .select("id, rank, url, posted_on, post_type, reach, views, likes_plus_comments, saves, shares")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .eq("entity_id", platformId)
    .order("rank")
    .returns<Row[]>();

  return (data ?? []).map((row) => ({
    id: row.id,
    rank: row.rank,
    url: row.url,
    postedOn: row.posted_on,
    postType: row.post_type,
    reach: row.reach,
    views: row.views,
    likesPlusComments: row.likes_plus_comments,
    saves: row.saves,
    shares: row.shares,
  }));
}
