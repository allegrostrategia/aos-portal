/**
 * The demo client's year: "Demo – Lemon Studio".
 *
 * **Figures a person would believe.** A demo whose numbers are random
 * is worse than no demo — Nina reads these pages for a living, and a
 * funnel that widens on the way down or a month where reach falls while
 * every rate rises is the first thing she will see. So nothing here is
 * independent: a platform has a follower curve, and its reach, profile
 * visits, link clicks and DMs are each worked out from the step above,
 * the same way the real ones are.
 *
 * Deterministic, so running it twice writes the same year and a
 * screenshot taken today still matches next week.
 */

/** mulberry32 — a small deterministic PRNG, seeded by name. */
function prng(seed) {
  let a = 0;
  for (let i = 0; i < seed.length; i += 1) a = (a * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number that wobbles by ±pct but stays on its trend. */
function jitter(seed, value, pct = 0.08) {
  return value * (1 + (prng(seed)() - 0.5) * 2 * pct);
}

const round = (n) => Math.round(n);
const money = (n) => Math.round(n * 100) / 100;
const pct1 = (n) => Math.round(n * 10) / 10;

/** The thirteen months: twelve published, then the current one as a draft. */
export function months(lastMonth) {
  const [y, m] = lastMonth.split("-").map(Number);
  const out = [];
  for (let i = 12; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }
  return out;
}

/**
 * The four platforms, each with its own shape.
 *
 * Different sizes and different growth on purpose: a demo where every
 * platform is the same curve in a different colour shows nothing about
 * what the page is for. TikTok triples while YouTube crawls, which is
 * the comparison the switcher exists to make.
 */
export const PLATFORMS = [
  { name: "Instagram", start: 18_200, end: 26_420, reachPerFollower: 7.0, engagement: 0.069, posts: [14, 20] },
  { name: "LinkedIn", start: 4_150, end: 6_100, reachPerFollower: 4.2, engagement: 0.048, posts: [8, 12] },
  { name: "TikTok", start: 3_100, end: 9_800, reachPerFollower: 12.5, engagement: 0.094, posts: [12, 22] },
  { name: "YouTube", start: 1_180, end: 2_430, reachPerFollower: 5.5, engagement: 0.057, posts: [3, 6] },
];

/** One platform's month, every figure derived from the one above it. */
export function platformMonth(platform, index, total) {
  const t = index / (total - 1);
  // Slightly S-shaped rather than linear, so the chart has a story in it.
  const curve = t * t * (3 - 2 * t);
  const followers = round(platform.start + (platform.end - platform.start) * curve);
  const previous =
    index === 0
      ? platform.start
      : round(
          platform.start +
            (platform.end - platform.start) *
              (((index - 1) / (total - 1)) ** 2 * (3 - 2 * ((index - 1) / (total - 1)))),
        );

  const seed = `${platform.name}:${index}`;
  const posts = round(jitter(`${seed}:posts`, (platform.posts[0] + platform.posts[1]) / 2, 0.25));
  const reach = round(jitter(`${seed}:reach`, followers * platform.reachPerFollower, 0.12));
  const views = round(reach * jitter(`${seed}:views`, 1.28, 0.08));
  const engagement = jitter(`${seed}:eng`, platform.engagement, 0.1);

  // The funnel, each step a share of the one above — never the other way
  // round, which is how a "funnel" ends up wider at the bottom.
  const profileVisits = round(reach * jitter(`${seed}:pv`, 0.048, 0.12));
  const linkClicks = round(profileVisits * jitter(`${seed}:lc`, 0.14, 0.15));
  const dms = round(linkClicks * jitter(`${seed}:dm`, 0.26, 0.2));

  const gained = Math.max(0, followers - previous) + round(jitter(`${seed}:churn`, followers * 0.004, 0.3));
  const fromFollowers = round(reach * jitter(`${seed}:own`, 0.32, 0.12));

  return {
    social_media_followers_at_month_end: followers,
    social_media_posts_published: posts,
    social_media_reach: reach,
    social_media_views: views,
    social_media_likes_plus_comments: round(reach * engagement),
    social_media_saves: round(reach * jitter(`${seed}:save`, 0.017, 0.2)),
    social_media_shares: round(reach * jitter(`${seed}:share`, 0.008, 0.25)),
    social_media_follows_gained: gained,
    social_media_profile_visits: profileVisits,
    social_media_link_clicks: linkClicks,
    social_media_dms_from_content: dms,
    social_media_keyword_comments: round(dms * jitter(`${seed}:kw`, 1.6, 0.25)),
    social_media_reach_from_followers: fromFollowers,
    social_media_reach_from_non_followers: reach - fromFollowers,
  };
}

export function trialReelsMonth(index) {
  const seed = `reels:${index}`;
  const posted = round(jitter(`${seed}:posted`, 6 + index * 0.4, 0.2));
  const views = round(jitter(`${seed}:views`, 42_000 + index * 5_200, 0.18));
  const followers = round(views * jitter(`${seed}:f`, 0.012, 0.2));
  return {
    trial_reels_trial_reels_posted: posted,
    trial_reels_total_views: views,
    trial_reels_new_followers_from_trial_reels: followers,
    trial_reels_profile_visits: round(views * jitter(`${seed}:pv`, 0.031, 0.15)),
    trial_reels_hours_spent_on_trial_reels: pct1(jitter(`${seed}:h`, 9 + index * 0.2, 0.2)),
    trial_reels_buyers_from_trial_reels: round(jitter(`${seed}:b`, 2 + index * 0.25, 0.4)),
  };
}

export function emailMonth(index, total) {
  const seed = `email:${index}`;
  const t = index / (total - 1);
  const list = round(5_800 + (9_400 - 5_800) * t * (1.1 - 0.1 * t));
  const newSubs = round(jitter(`${seed}:new`, 420 + index * 18, 0.2));
  return {
    email_list_size_at_month_end: list,
    email_new_subscribers: newSubs,
    email_unsubscribes: round(newSubs * jitter(`${seed}:un`, 0.14, 0.3)),
    email_emails_sent: round(jitter(`${seed}:sent`, 8, 0.3)),
    email_average_open_rate: pct1(jitter(`${seed}:open`, 33 + t * 11, 0.07)),
    email_average_click_rate: pct1(jitter(`${seed}:click`, 2.6 + t * 2.3, 0.12)),
    email_sales_from_email: round(jitter(`${seed}:sales`, 3 + index * 0.35, 0.35)),
    email_revenue_from_email: money(jitter(`${seed}:rev`, 2_400 + index * 320, 0.22)),
  };
}

/** The two funnels, each a descending chain with its own conversion. */
export const FUNNELS = [
  { name: "Free Masterclass Funnel", offer: "Group Programme", views: 3_400, optIn: 0.41, buy: 0.052, price: 250 },
  { name: "Lead Magnet → VIP Day", offer: "VIP Day", views: 1_900, optIn: 0.34, buy: 0.027, price: 1_500 },
];

export function funnelMonth(funnel, index, total) {
  const seed = `${funnel.name}:${index}`;
  const t = index / (total - 1);
  const views = round(jitter(`${seed}:v`, funnel.views * (0.75 + 0.5 * t), 0.15));
  const optIns = round(views * jitter(`${seed}:o`, funnel.optIn, 0.09));
  const salesViews = round(optIns * jitter(`${seed}:sp`, 0.62, 0.1));
  const checkouts = round(salesViews * jitter(`${seed}:co`, 0.18, 0.15));
  const purchases = Math.max(0, round(checkouts * jitter(`${seed}:p`, 0.42, 0.18)));
  return {
    funnels_landing_page_views: views,
    funnels_opt_ins: optIns,
    funnels_sales_page_views: salesViews,
    funnels_checkouts_started: checkouts,
    funnels_purchases: purchases,
    funnels_order_bumps_taken: round(purchases * jitter(`${seed}:ob`, 0.3, 0.3)),
    funnels_upsells_taken: round(purchases * jitter(`${seed}:up`, 0.16, 0.4)),
    funnels_offer_price_at_month: funnel.price,
  };
}

/**
 * Five campaigns, and the goal is the part that matters: only the two
 * selling or generating leads should carry a cost per lead, which is
 * what the goalless-campaign warning on the entry screen is about.
 */
export const CAMPAIGNS = [
  { name: "Masterclass — Leads", goal: "leads", spend: 1_450, cpl: 4.4 },
  { name: "Retargeting — Sales", goal: "sales", spend: 820, cpl: 9.1 },
  { name: "Reels Boost", goal: "profile_visits", spend: 390, cpl: null },
  { name: "Blog Traffic", goal: "traffic", spend: 260, cpl: null },
  { name: "Brand Awareness", goal: "awareness", spend: 310, cpl: null },
];

export function campaignMonth(campaign, index, total) {
  const seed = `${campaign.name}:${index}`;
  const t = index / (total - 1);
  const spend = money(jitter(`${seed}:s`, campaign.spend * (0.8 + 0.45 * t), 0.16));
  const impressions = round(spend * jitter(`${seed}:i`, 310, 0.18));
  const reach = round(impressions * jitter(`${seed}:r`, 0.62, 0.1));
  const clicks = round(impressions * jitter(`${seed}:c`, 0.014, 0.18));
  const leads = campaign.cpl ? Math.max(1, round(spend / jitter(`${seed}:l`, campaign.cpl, 0.14))) : 0;
  const purchases = campaign.goal === "sales" ? Math.max(0, round(leads * 0.17)) : 0;
  return {
    ads_spend: spend,
    ads_impressions: impressions,
    ads_reach: reach,
    ads_link_clicks: clicks,
    ads_leads: leads,
    ads_purchases: purchases,
    ads_revenue_from_ads: money(purchases * jitter(`${seed}:rv`, 1_250, 0.2)),
    ads_profile_visits_from_ads: round(clicks * jitter(`${seed}:pv`, 0.5, 0.2)),
  };
}

export function leadsMonth(index) {
  const seed = `leads:${index}`;
  const social = round(jitter(`${seed}:soc`, 26 + index * 1.4, 0.18));
  const email = round(jitter(`${seed}:em`, 14 + index * 0.8, 0.2));
  const referral = round(jitter(`${seed}:ref`, 7 + index * 0.3, 0.3));
  const other = round(jitter(`${seed}:oth`, 4, 0.4));
  /**
   * **Calls come off the organic leads, not the ad leads.**
   *
   * A £1,450 masterclass campaign at £4.40 a lead is 330 leads a month,
   * which is believable for a low-ticket opt-in and nonsense as a
   * pipeline of sales calls. Feeding them in gave the demo 224 active
   * clients for a studio with three retainers — arithmetically right
   * and obviously wrong to anybody reading the page.
   */
  const booked = round((social + email + referral + other) * jitter(`${seed}:bk`, 0.17, 0.12));
  const held = round(booked * jitter(`${seed}:hd`, 0.78, 0.08));
  return {
    leads_conversions_new_leads_from_social: social,
    leads_conversions_new_leads_from_email: email,
    leads_conversions_new_leads_from_referral: referral,
    leads_conversions_new_leads_from_other: other,
    leads_conversions_calls_booked: booked,
    leads_conversions_calls_held: held,
    leads_conversions_new_clients: round(held * jitter(`${seed}:cl`, 0.34, 0.15)),
  };
}

export function clientExperienceMonth(index) {
  const seed = `cx:${index}`;
  return {
    client_experience_clients_who_left: round(jitter(`${seed}:left`, 1.6, 0.6)),
    client_experience_renewals_and_upsells: round(jitter(`${seed}:ren`, 3 + index * 0.2, 0.35)),
    client_experience_issues_raised: round(jitter(`${seed}:iss`, 1.4, 0.7)),
    client_experience_testimonials_received: round(jitter(`${seed}:test`, 2.2, 0.5)),
    client_experience_programme_completions: round(jitter(`${seed}:comp`, 4 + index * 0.3, 0.3)),
    client_experience_repeat_engagers: round(jitter(`${seed}:rep`, 18 + index * 0.9, 0.2)),
  };
}
