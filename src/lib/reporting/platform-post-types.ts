import type { PlatformKind } from "./platforms.ts";
import type { PostType, TopPost } from "./top-posts.ts";

/**
 * What kinds of post each kind of platform has (§5.2).
 *
 * "A LinkedIn post cannot be a Reel" — `platform-metric-sets.md`, under
 * "What this touches", approved by Nina on 16 November 2026. Every
 * platform was offered the same six because there was one list and it
 * had been written for Instagram, which is why a LinkedIn article could
 * be filed as a Story.
 *
 * **In code, beside `platform-metrics.ts`,** and for the same reason:
 * the enum says which types a post may have, and this says which ones a
 * screen offers. One is a constraint on the data and the other is a
 * question put to a person, and they change on different days.
 *
 * **Where a kind of post means the same thing, it is the same value.**
 * This is `platform-metrics.ts`'s third rule applied to a type, and it
 * does more work here than it does there:
 *
 * - A LinkedIn **Image** and an Instagram **Photo** are one photograph
 *   under two words, so they are `photo`.
 * - A **Document / carousel**, a **Photo carousel** and a **Carousel**
 *   are a swipeable stack of pages, so they are `carousel`.
 * - A YouTube **Short** and an Instagram **Reel** are the same vertical
 *   short video, so they are `reel`. TikTok's is just called "Video" and
 *   is TikTok's only one, which is why that one is `video`.
 * - A YouTube **Long-form** is a video, so it is `video`.
 *
 * Which means a kind corrected keeps every post's type — the client who
 * set "Other" and put their Reels in, then said Instagram, does not come
 * back to three posts typed as nothing.
 *
 * **"Post" is on every list.** Nina's five lists do not have it and it
 * is not in any of them as a kind of post; it is the escape hatch for
 * something that fits none of them, and the value the Meta import falls
 * back to rather than guessing. A client who cannot say what a post was
 * should say that, not pick the nearest wrong word.
 */

export interface PostTypeSet {
  /** The types this kind offers, in the order the picker shows them. */
  types: readonly PostType[];
  /** What this kind calls one, where it differs from the plain word. */
  words?: Readonly<Partial<Record<PostType, string>>>;
}

/** The plain words, for a platform nobody has said anything about. */
export const POST_TYPE_LABELS: Record<PostType, string> = {
  reel: "Reel",
  carousel: "Carousel",
  photo: "Photo",
  video: "Video",
  story: "Story",
  text: "Text",
  link: "Link",
  poll: "Poll",
  article: "Article",
  live: "Live",
  other: "Post",
};

/**
 * The general set, for "Other" and for a platform with no kind yet.
 *
 * Lean, like the general figure set and for the same reason: it serves a
 * platform we know nothing about. A photograph, a video, a stack of
 * pages, words and a link are the five shapes a post takes nearly
 * everywhere — a Pin is a photo, a Thread is text — and anything else is
 * a Post. No Story, no Reel: those are one company's words for one
 * company's format, and offering them to a client on Pinterest is the
 * problem this whole document exists to fix.
 */
export const GENERAL_POST_TYPES: PostTypeSet = {
  types: ["photo", "video", "carousel", "text", "link", "other"],
};

export const POST_TYPE_SETS: Record<PlatformKind, PostTypeSet> = {
  /** Today's four, unchanged. */
  instagram: { types: ["reel", "carousel", "photo", "story", "other"] },

  linkedin: {
    types: ["text", "photo", "carousel", "video", "poll", "article", "other"],
    words: { photo: "Image", carousel: "Document / carousel" },
  },

  tiktok: {
    types: ["video", "carousel", "live", "other"],
    // Nina's own table writes it in capitals, which is how TikTok does.
    words: { carousel: "Photo carousel", live: "LIVE" },
  },

  facebook: { types: ["photo", "video", "reel", "link", "text", "other"] },

  youtube: {
    types: ["video", "reel", "live", "other"],
    words: { video: "Long-form", reel: "Short" },
  },

  other: GENERAL_POST_TYPES,
};

export function postTypeSetFor(kind: PlatformKind | null): PostTypeSet {
  return kind ? POST_TYPE_SETS[kind] : GENERAL_POST_TYPES;
}

/** One kind of post, in this platform's word for it. */
export function postTypeLabel(type: PostType, kind: PlatformKind | null): string {
  return postTypeSetFor(kind).words?.[type] ?? POST_TYPE_LABELS[type];
}

/**
 * The types to offer on this platform — plus any a post already has.
 *
 * The same `held` rule the figures follow, and it matters more here:
 * a figure that stops being asked for still shows its number, but a
 * select with no matching option silently renders as the first one. A
 * client whose platform went from Other to LinkedIn would have opened
 * the screen, seen three posts apparently typed "Text", and saved it.
 */
export function postTypesFor(
  kind: PlatformKind | null,
  held: (type: PostType) => boolean = () => false,
): PostType[] {
  const set = postTypeSetFor(kind);
  const extra = (Object.keys(POST_TYPE_LABELS) as PostType[]).filter(
    (type) => !set.types.includes(type) && held(type),
  );
  return [...set.types, ...extra];
}

/**
 * Which of a post's five figures this kind of platform reports, and what
 * it calls them.
 *
 * **The columns are fixed and the words are not.** `report_top_posts`
 * has had `reach, views, likes_plus_comments, saves, shares` since 11
 * November, written for Instagram like everything else was, and they
 * are columns rather than rows — so a kind cannot add a sixth. What it
 * can do is use the ones that mean something to it, under its own
 * words, and leave the rest alone:
 *
 * - LinkedIn's `reach` column holds **impressions**, its `likes` column
 *   holds **reactions + comments**, and its `shares` column holds
 *   **reposts**. It has no views and no saves.
 * - TikTok's `views` column holds **video views** and its `saves`
 *   column holds **favourites**. It has no reach.
 * - YouTube has views and likes, and nothing else here.
 *
 * This is the same trade the account-level figures make — one stored
 * thing, each platform's word for it — and it has the same consequence:
 * a kind corrected keeps every number somebody typed.
 *
 * **Nothing is hidden that has a figure in it.** A column a kind does
 * not report still shows when a post HOLDS one, for the same reason the
 * report filters no metric: it is a number a person entered, and a
 * screen that silently drops it is worse than one that labels it
 * plainly. `postFiguresFor` is what applies that.
 */
export type PostFigureKey = "reach" | "views" | "likesPlusComments" | "saves" | "shares";

export const POST_FIGURE_LABELS: Record<PostFigureKey, string> = {
  reach: "Reach",
  views: "Views",
  likesPlusComments: "Likes + comments",
  saves: "Saves",
  shares: "Shares",
};

export interface PostFigureSet {
  keys: readonly PostFigureKey[];
  words?: Readonly<Partial<Record<PostFigureKey, string>>>;
}

export const GENERAL_POST_FIGURES: PostFigureSet = {
  keys: ["reach", "views", "likesPlusComments", "saves", "shares"],
};

export const POST_FIGURE_SETS: Record<PlatformKind, PostFigureSet> = {
  instagram: GENERAL_POST_FIGURES,
  linkedin: {
    keys: ["reach", "likesPlusComments", "shares"],
    words: {
      reach: "Impressions",
      likesPlusComments: "Reactions + comments",
      shares: "Reposts",
    },
  },
  tiktok: {
    keys: ["views", "likesPlusComments", "saves", "shares"],
    words: { views: "Video views", saves: "Favourites" },
  },
  facebook: {
    keys: ["reach", "likesPlusComments", "shares"],
    words: { likesPlusComments: "Reactions + comments" },
  },
  youtube: { keys: ["views", "likesPlusComments"], words: { likesPlusComments: "Likes" } },
  other: GENERAL_POST_FIGURES,
};

export function postFigureSetFor(kind: PlatformKind | null): PostFigureSet {
  return kind ? POST_FIGURE_SETS[kind] : GENERAL_POST_FIGURES;
}

/** One of a post's figures, in this platform's word for it. */
export function postFigureLabel(key: PostFigureKey, kind: PlatformKind | null): string {
  return postFigureSetFor(kind).words?.[key] ?? POST_FIGURE_LABELS[key];
}

/**
 * The figures to show for a post on this platform — plus any it holds.
 *
 * `held` takes the posts rather than a key, because "this platform does
 * not report saves" and "none of these three posts has one" are the
 * same thing on screen and only one of them is a reason to drop the box
 * from the form somebody types into.
 */
export function postFiguresFor(
  kind: PlatformKind | null,
  posts: Pick<TopPost, PostFigureKey>[] = [],
): PostFigureKey[] {
  const set = postFigureSetFor(kind);
  const extra = (Object.keys(POST_FIGURE_LABELS) as PostFigureKey[]).filter(
    (key) => !set.keys.includes(key) && posts.some((post) => post[key] !== null),
  );
  return [...set.keys, ...extra];
}
