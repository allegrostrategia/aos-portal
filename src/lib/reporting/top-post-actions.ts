"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "./access.ts";
import { firstOfMonth } from "./months.ts";
import { getWorkspace } from "./queries.ts";
import { POST_TYPES, isSafeUrl, type PostType } from "./top-posts.ts";

/**
 * The month's top three posts on one platform (Nina, 11 November).
 *
 * The same shape as §5.3's hooks: three ranked rows, saved together,
 * and an emptied row means "there is no third one this month" rather
 * than a row of nothing.
 *
 * Fields are `post:<rank>:<field>`, with the rank in the name rather
 * than in a parallel list — a form posts a flat bag, and two lists that
 * have to line up by index is how the wrong figures end up under the
 * wrong link.
 *
 * **No caption field, anywhere in this file.** Nina, 11 November: the
 * link opens the post. §10.1's rule that captions are never stored
 * stays as written.
 */

export type TopPostState = { error?: string; notice?: string } | null;

const FIELDS = ["url", "posted_on", "post_type", "reach", "views", "likes", "saves", "shares"];

const COLUMN: Record<string, string> = {
  reach: "reach",
  views: "views",
  likes: "likes_plus_comments",
  saves: "saves",
  shares: "shares",
};

interface Submitted {
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

/** A whole number, or null. Blank is a real answer: nobody knows. */
function count(raw: string): number | null | "bad" {
  const text = raw.trim().replace(/[,\s]/g, "");
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return "bad";
  return Math.round(n);
}

export async function saveTopPosts(
  _prev: TopPostState,
  formData: FormData,
): Promise<TopPostState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const platformId = String(formData.get("platform_id") ?? "").trim();
  if (!workspaceId || !month) return { error: "That was missing something." };
  if (!platformId) return { error: "Which platform?" };

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayEdit) return { error: "Your report is filled in by your Allegro team." };

  const supabase = await createClient();

  // The platform has to be one of theirs. The database says so too, in a
  // trigger — this is the half that gives a sentence rather than a
  // constraint name.
  const { data: platform } = await supabase
    .from("report_entities")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "social_platform")
    .eq("id", platformId)
    .maybeSingle<{ id: string }>();
  if (!platform) return { error: "That platform isn't this client's." };

  const submitted: Submitted[] = [];
  const emptied: number[] = [];

  for (const rank of [1, 2, 3]) {
    const read = (field: string) => String(formData.get(`post:${rank}:${field}`) ?? "").trim();
    const url = read("url");
    const anything = FIELDS.some((field) => read(field) !== "");

    if (!anything) continue;
    if (url === "") {
      // Figures with no link are not a post. Said rather than silently
      // dropped, because somebody typed them.
      return { error: `Post ${rank} needs a link, or clear the whole row.` };
    }
    if (!isSafeUrl(url)) {
      return { error: `Post ${rank}'s link should start with https://.` };
    }

    const typeRaw = read("post_type");
    if (typeRaw !== "" && !POST_TYPES.includes(typeRaw as PostType)) {
      return { error: `Post ${rank}'s kind is not one of the choices.` };
    }

    const postedOn = read("posted_on");
    if (postedOn !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(postedOn)) {
      return { error: `Post ${rank}'s date should be a day, like 2026-09-14.` };
    }

    const figures: Record<string, number | null> = {};
    for (const [field, column] of Object.entries(COLUMN)) {
      const value = count(read(field));
      if (value === "bad") return { error: `Post ${rank}'s ${field} should be a whole number.` };
      figures[column] = value;
    }

    submitted.push({
      rank,
      url,
      posted_on: postedOn === "" ? null : postedOn,
      post_type: typeRaw === "" ? null : (typeRaw as PostType),
      reach: figures.reach,
      views: figures.views,
      likes_plus_comments: figures.likes_plus_comments,
      saves: figures.saves,
      shares: figures.shares,
    });
  }

  for (const rank of [1, 2, 3]) {
    if (!submitted.some((post) => post.rank === rank)) emptied.push(rank);
  }

  const { data: existingRows, error: readError } = await supabase
    .from("report_top_posts")
    .select("id, rank")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .eq("entity_id", platformId)
    .returns<{ id: string; rank: number }[]>();

  if (readError) return { error: `Couldn't read this month's posts: ${readError.message}` };
  const existing = new Map((existingRows ?? []).map((row) => [row.rank, row.id]));

  let changed = 0;

  for (const post of submitted) {
    const id = existing.get(post.rank);
    const fields = {
      workspace_id: workspaceId,
      month,
      entity_id: platformId,
      source: String(formData.get(`post:${post.rank}:source`) ?? "") === "csv" ? "csv" : "manual",
      ...post,
    };

    const { data, error } = id
      ? await supabase.from("report_top_posts").update(fields).eq("id", id).select("id")
      : await supabase.from("report_top_posts").insert(fields).select("id");

    if (error) return { error: `Couldn't save post ${post.rank}: ${error.message}` };
    // Checked, not assumed: a write RLS refuses is not an error.
    if (!data || data.length === 0) return { error: "Those posts aren't yours to save." };
    changed += 1;
  }

  // **An emptied row is a delete, and the right one.** A post that is
  // no longer in the top three is not a row of nothing — it is not in
  // the list. The same rule a cleared target follows.
  for (const rank of emptied) {
    const id = existing.get(rank);
    if (!id) continue;
    const { data, error } = await supabase
      .from("report_top_posts")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return { error: `Couldn't clear post ${rank}: ${error.message}` };
    if (!data || data.length === 0) {
      return { error: "A post could not be cleared. Nothing else was changed." };
    }
    changed += 1;
  }

  if (changed === 0) return { notice: "Nothing changed." };

  revalidatePath("/reporting", "layout");
  return { notice: "Top posts saved." };
}
