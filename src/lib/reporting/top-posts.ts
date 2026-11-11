/**
 * The month's three best posts on one platform (Nina, 11 November).
 *
 * "Top performing posts matters more than the overall stats, because it
 * shows clients what style of post to make next month." So the list is a
 * link, a date, what kind of post it was, and the figures that say why
 * it is in the list.
 *
 * **No caption, deliberately.** The first proposal kept a short snippet
 * beside each link; Nina said no on 11 November. The link opens the
 * post, which has the caption in it, and §10.1's "the file itself is
 * never stored, only the numbers taken from it" goes on being true as
 * written rather than true with an exception.
 */

export const POST_TYPES = ["reel", "carousel", "photo", "video", "story", "other"] as const;
export type PostType = (typeof POST_TYPES)[number];

export interface TopPost {
  id?: string;
  /** 1, 2 or 3 — the order they are shown in, and what the table keys on. */
  rank: number;
  url: string;
  postedOn: string | null;
  postType: PostType | null;
  reach: number | null;
  views: number | null;
  likesPlusComments: number | null;
  saves: number | null;
  shares: number | null;
}

/**
 * What a post is ranked by: **reach, falling back to views** (Nina,
 * 11 November).
 *
 * Reach is the closest thing the figures have to "this one travelled",
 * which is the question a client asks of a post they are deciding
 * whether to make another of. Engagement rate would put a post six loyal
 * followers commented on above a reel that reached forty thousand, and
 * raw likes mostly reproduces the account's baseline.
 *
 * Views rather than nothing, because Instagram reports reach and TikTok
 * reports views, and a platform that has no reach figure should still
 * get a list rather than an empty card.
 *
 * **Ranking on per-post reach is not the same as summing it.** §10.1
 * refuses the sum — post reach added up double counts anybody who saw
 * two posts — and ordering three numbers does nothing of the kind.
 */
export function rankBy(post: Pick<TopPost, "reach" | "views">): number | null {
  return post.reach ?? post.views ?? null;
}

/**
 * The best three, in order.
 *
 * A post with neither reach nor views is left out rather than ranked
 * last: it is not a post that did badly, it is a post nobody has figures
 * for, and putting it third would be a claim about it.
 *
 * Ties keep the order they arrived in, which for an import is the
 * order of the file.
 */
export function topThree<T extends Pick<TopPost, "reach" | "views">>(posts: T[]): T[] {
  return posts
    .map((post, index) => ({ post, index, by: rankBy(post) }))
    .filter((row): row is { post: T; index: number; by: number } => row.by !== null)
    .sort((a, b) => b.by - a.by || a.index - b.index)
    .slice(0, 3)
    .map((row) => row.post);
}

/**
 * Is this a link we are willing to put in an anchor?
 *
 * `javascript:` in an href is the one string that turns a report into
 * somewhere to run code, and a client's report is read by people who did
 * not type what is in it. The database has the same check as a column
 * constraint — this is the half that means nobody is invited to try.
 */
export function isSafeUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url.trim());
}

/** Meta's "Post type" column, mapped onto the six we store. */
export function postTypeFrom(raw: string | undefined | null): PostType | null {
  const text = (raw ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text.includes("reel")) return "reel";
  if (text.includes("carousel") || text.includes("album")) return "carousel";
  if (text.includes("story") || text.includes("stories")) return "story";
  if (text.includes("photo") || text.includes("image")) return "photo";
  if (text.includes("video")) return "video";
  return "other";
}
