import type { PlatformKind } from "./platforms.ts";
import type { ReportMetric } from "./queries.ts";

/**
 * Which figures each kind of platform is asked for (§5.2).
 *
 * `docs/reporting/platform-metric-sets.md`, approved by Nina on 16
 * November 2026. Until step 1 of that document every platform was asked
 * the same fourteen questions, because there was one Social Media list
 * and it had been written for Instagram — which is why LinkedIn showed a
 * save rate and why its post types were reels and carousels.
 *
 * **In code, not in the database**, the same division
 * `OFFER_HOURS_METRICS` already follows: `report_metrics` says a figure
 * exists and what unit it wears, and a figure is stored per platform
 * whatever its kind. Which boxes a screen asks for is a product decision
 * that changes with a screen rather than with a schema, and putting it
 * here means one list rather than a column every reader must remember to
 * filter on.
 *
 * Three rules hold this together:
 *
 * 1. **A figure that exists is never hidden.** `platformMetrics` takes a
 *    `held` predicate and keeps anything the month already holds, in or
 *    out of the set. So a client whose kind changes — "Other" corrected
 *    to LinkedIn — can still see and edit every figure anybody entered,
 *    and a published month cannot lose a row. Rule 7: nothing is ever
 *    deleted.
 * 2. **The report does not filter at all.** `platformOrdered` reorders
 *    and renames, and nothing more: every report screen already drops a
 *    metric whose figure is null, so a month shows what it HOLDS. The
 *    kind decides what you are asked, never what you are shown.
 * 3. **Where a figure means the same thing, it is the same figure.**
 *    Followers and subscribers are one metric with two words, as are
 *    profile visits, profile views and page visits — so the Overview
 *    reads one key whatever the main platform is, and a client who
 *    corrects a kind keeps their history. A new metric is for a
 *    genuinely different measurement: impressions is not reach, a
 *    reaction is not a like, video views is not reach.
 */

/** What a kind calls a shared figure, where it differs. */
export interface PlatformWords {
  label?: string;
  /** The line under a worked-out figure, where the arithmetic differs. */
  formula?: string;
}

export interface PlatformSet {
  /** The figures this kind asks for, in the order a screen shows them. */
  keys: readonly string[];
  words?: Readonly<Record<string, PlatformWords>>;
}

const FOLLOWERS = "social_media_followers_at_month_end";
const POSTS = "social_media_posts_published";
const NET_GROWTH = "social_media_net_follower_growth";
const GROWTH_PERCENT = "social_media_follower_growth";
const ENGAGEMENT = "social_media_engagement_rate";
const PROFILE_VISITS = "social_media_profile_visits";
const PROFILE_VIEW_RATE = "social_media_profile_view_rate";
const CTR = "social_media_click_through_rate";

/**
 * The general set: a platform nobody has named a kind for, and "Other".
 *
 * Deliberately lean — followers, reach, views, engagement, as Nina's
 * document puts it — because it serves a platform we know nothing about.
 * A client on Pinterest or Threads is not stuck, and is not asked for a
 * save rate that platform may not have. Nothing is lost by it being
 * short: `held` keeps whatever was entered before.
 *
 * **Saves, added by Nina on 18 November.** Pinterest is the platform
 * "Other" was written for and a save is the whole of how Pinterest is
 * read; a client on it would have had no box for the one figure that
 * matters. It also closes a gap this set had from the day it was
 * written: the general engagement rate is the Instagram formula, saves
 * among its ingredients, so "Other" was already counting a figure it
 * never asked anybody for. The save RATE is deliberately not here —
 * saves ÷ reach is Instagram's reading of it and we do not know what
 * this platform calls either half. One line if she wants it.
 */
export const GENERAL_SET: PlatformSet = {
  keys: [
    FOLLOWERS,
    POSTS,
    "social_media_reach",
    "social_media_views",
    "social_media_likes_plus_comments",
    "social_media_saves",
    "social_media_shares",
    PROFILE_VISITS,
    "social_media_link_clicks",
    "social_media_dms_from_content",
    NET_GROWTH,
    GROWTH_PERCENT,
    ENGAGEMENT,
    "social_media_reach_per_post",
  ],
};

export const PLATFORM_SETS: Record<PlatformKind, PlatformSet> = {
  /**
   * Today's set, unchanged. Nina: "This is today's set. Nothing is
   * lost." Every live platform on 17 November was Instagram or named
   * plainly enough for the backfill, so this list is what the screens
   * showed the day before the kind existed.
   */
  instagram: {
    keys: [
      FOLLOWERS,
      POSTS,
      "social_media_reach",
      "social_media_views",
      "social_media_likes_plus_comments",
      "social_media_saves",
      "social_media_shares",
      "social_media_follows_gained",
      PROFILE_VISITS,
      "social_media_link_clicks",
      "social_media_dms_from_content",
      "social_media_keyword_comments",
      "social_media_reach_from_followers",
      "social_media_reach_from_non_followers",
      NET_GROWTH,
      GROWTH_PERCENT,
      ENGAGEMENT,
      "social_media_save_rate",
      "social_media_share_rate",
      "social_media_reach_per_post",
      "social_media_profile_visit_to_follow",
      "social_media_non_follower_reach",
    ],
  },

  /**
   * Reach becomes two figures, because LinkedIn reports both and they
   * are different numbers; likes + comments splits, because LinkedIn
   * counts a reaction and a comment separately; saves and shares are
   * gone, with reposts in place of shares. DMs from content is optional
   * and is Instagram's own metric on a second platform (Nina, 16 Nov) —
   * it is where a lot of service-business conversations start.
   */
  linkedin: {
    keys: [
      FOLLOWERS,
      POSTS,
      "social_media_impressions",
      "social_media_members_reached",
      "social_media_reactions",
      "social_media_comments",
      "social_media_reposts",
      PROFILE_VISITS,
      "social_media_link_clicks",
      "social_media_dms_from_content",
      NET_GROWTH,
      GROWTH_PERCENT,
      ENGAGEMENT,
      "social_media_impressions_per_post",
      CTR,
      PROFILE_VIEW_RATE,
    ],
    words: {
      [PROFILE_VISITS]: { label: "Profile views" },
      // Against impressions, which is how LinkedIn reports it.
      [ENGAGEMENT]: { formula: "(Reactions + comments + reposts) ÷ impressions" },
      [CTR]: { formula: "Link clicks ÷ impressions" },
      [PROFILE_VIEW_RATE]: { formula: "Profile views ÷ impressions" },
    },
  },

  /** Reach becomes video views, and favourites is TikTok's save. */
  tiktok: {
    keys: [
      FOLLOWERS,
      POSTS,
      "social_media_video_views",
      "social_media_likes",
      "social_media_comments",
      "social_media_shares",
      "social_media_favourites",
      PROFILE_VISITS,
      NET_GROWTH,
      GROWTH_PERCENT,
      ENGAGEMENT,
      "social_media_views_per_post",
      PROFILE_VIEW_RATE,
      "social_media_favourite_rate",
    ],
    words: {
      [PROFILE_VISITS]: { label: "Profile views" },
      [ENGAGEMENT]: {
        formula: "(Likes + comments + shares + favourites) ÷ video views",
      },
      "social_media_views_per_post": { formula: "Video views ÷ posts published" },
      [PROFILE_VIEW_RATE]: { formula: "Profile views ÷ video views" },
    },
  },

  /**
   * Post engagements is Facebook's own headline figure and has no
   * Instagram equivalent, so it is entered rather than worked out. A
   * page has no saves, and a profile visit is a page visit — which is
   * the same idea in Facebook's words, and worth getting right on a
   * page a client reads.
   */
  facebook: {
    keys: [
      FOLLOWERS,
      POSTS,
      "social_media_reach",
      "social_media_post_engagements",
      "social_media_reactions",
      "social_media_comments",
      "social_media_shares",
      "social_media_link_clicks",
      PROFILE_VISITS,
      NET_GROWTH,
      GROWTH_PERCENT,
      ENGAGEMENT,
      "social_media_reach_per_post",
      CTR,
      PROFILE_VIEW_RATE,
    ],
    words: {
      [PROFILE_VISITS]: { label: "Page visits" },
      [ENGAGEMENT]: { formula: "Post engagements ÷ reach" },
      [CTR]: { formula: "Link clicks ÷ reach" },
      [PROFILE_VIEW_RATE]: { label: "Page visit rate", formula: "Page visits ÷ reach" },
    },
  },

  /**
   * Followers are subscribers and posts are videos — the same figures
   * under the words YouTube uses, so the Overview reads one key and a
   * client who corrects a kind keeps their history. Watch time is what
   * YouTube is actually judged on and nothing else here has an
   * equivalent. The click-through rate and the average view duration
   * are **typed** (Nina, 16 November): YouTube Studio hands them to you,
   * and the worked-out versions would disagree with the figure she would
   * quote. Likes, saves, shares and profile visits all go.
   */
  youtube: {
    keys: [
      FOLLOWERS,
      POSTS,
      "social_media_views",
      "social_media_watch_time",
      "social_media_impressions",
      "social_media_reported_click_through_rate",
      "social_media_average_view_duration",
      NET_GROWTH,
      GROWTH_PERCENT,
      "social_media_views_per_post",
      "social_media_watch_time_per_view",
    ],
    words: {
      [FOLLOWERS]: { label: "Subscribers at month end" },
      [POSTS]: { label: "Videos published" },
      // The unit already prints the h; the label would say it twice.
      "social_media_watch_time": { label: "Watch time" },
      "social_media_reported_click_through_rate": { label: "Click-through rate" },
      [NET_GROWTH]: {
        label: "Net subscriber growth",
        formula: "Subscribers now − subscribers last month",
      },
      [GROWTH_PERCENT]: {
        label: "Subscriber growth %",
        formula: "Net growth ÷ subscribers last month",
      },
      "social_media_views_per_post": {
        label: "Views per video",
        formula: "Views ÷ videos published",
      },
      /**
       * **Not in YouTube's set, but it is still drawn.** Impressions
       * and videos published are both here, so the calc produces a
       * figure, and a report filters nothing — it shows what the month
       * HOLDS. So the word has to be right for the platform even where
       * the set did not ask for it. (18 November, off the demo's
       * YouTube page, which read "Impressions per post" on a channel
       * that publishes videos.)
       */
      "social_media_impressions_per_post": {
        label: "Impressions per video",
        formula: "Impressions ÷ videos published",
      },
    },
  },

  other: GENERAL_SET,
};

export function platformSetFor(kind: PlatformKind | null): PlatformSet {
  return kind ? PLATFORM_SETS[kind] : GENERAL_SET;
}

/** A metric wearing this kind's words for it. */
function dressed(metric: ReportMetric, set: PlatformSet): ReportMetric {
  const words = set.words?.[metric.key];
  if (!words) return metric;
  return {
    ...metric,
    label: words.label ?? metric.label,
    formula: words.formula ?? metric.formula,
  };
}

/**
 * This kind's figures, in its order, wearing its words — plus anything
 * the month already holds.
 *
 * For the **entry** screens, which is the one place the kind decides
 * what is on screen. Non-social metrics are passed through untouched, so
 * a caller can hand this a whole category list without knowing whether
 * it is Social Media.
 *
 * `held` is why a kind can be corrected safely: a figure with a value is
 * kept whatever the set says, so it stays visible and editable rather
 * than stranded in a database nobody can see. It sorts after the set,
 * because it is no longer a figure this platform is being asked for.
 */
export function platformMetrics(
  metrics: ReportMetric[],
  kind: PlatformKind | null,
  held: (key: string) => boolean = () => false,
): ReportMetric[] {
  const set = platformSetFor(kind);
  const order = new Map(set.keys.map((key, index) => [key, index]));
  const rank = (metric: ReportMetric) =>
    order.get(metric.key) ?? order.size + metric.sort_order;

  const kept = metrics.filter(
    (m) => m.category !== "social_media" || order.has(m.key) || held(m.key),
  );

  /**
   * Social Media's rows are reordered **among themselves**, in place.
   *
   * Not one `sort` over the whole list with a comparator that returns 0
   * for anything else: a comparator that is not a total order gives an
   * arrangement that depends on the sort's internals, which is the kind
   * of thing that works on one list length and not another.
   */
  const slots = kept.map((m, i) => (m.category === "social_media" ? i : -1)).filter((i) => i >= 0);
  const sorted = slots.map((i) => kept[i]).sort((a, b) => rank(a) - rank(b));
  slots.forEach((slot, n) => {
    kept[slot] = dressed(sorted[n], set);
  });
  return kept;
}

/**
 * The same order and the same words, filtering nothing.
 *
 * For the **report** screens and the PDF. They already drop every metric
 * whose figure is null, so a month shows the figures it holds — and that
 * is what makes a kind safe to change after a month has gone out. A
 * filter here would be the one thing that could take a row off a report
 * somebody has already been sent.
 */
export function platformOrdered(
  metrics: ReportMetric[],
  kind: PlatformKind | null,
): ReportMetric[] {
  return platformMetrics(metrics, kind, () => true);
}

/** Is this figure one that kind of platform is asked for at all? */
export function platformAsks(metricKey: string, kind: PlatformKind | null): boolean {
  return platformSetFor(kind).keys.includes(metricKey);
}

/**
 * The Overview card's short word for a figure, on this kind of platform.
 *
 * Separate from the set's own label because a card is not a row: it has
 * about 115px beside a 40px disc, which is why the card says "Followers"
 * where the metric says "Followers at month end". YouTube's card says
 * **Subscribers** (Nina's document, under "The Overview"), and the
 * figure under it is still the main platform's own, never a sum —
 * followers added across platforms count the same person twice.
 */
export function platformCardLabel(
  metricKey: string,
  kind: PlatformKind | null,
  fallback: string,
): string {
  if (kind === "youtube" && metricKey === FOLLOWERS) return "Subscribers";
  return fallback;
}

/** One figure's name on a given kind of platform, for a card elsewhere. */
export function platformLabel(metric: ReportMetric, kind: PlatformKind | null): string {
  return dressed(metric, platformSetFor(kind)).label;
}
