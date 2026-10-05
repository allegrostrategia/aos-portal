/**
 * Every calculation in the reporting tool, in one place.
 *
 * Brief §9: "All formulas live in one shared code module used by both the
 * entry screen and the report, so the 'Worked out for you' card and the
 * published report can never disagree." This is that module. It is pure — no
 * database, no React, no formatting — so both sides can call it and the tests
 * can be arithmetic rather than fixtures.
 *
 * Three conventions, and getting them wrong is how a report lies:
 *
 * 1. **Missing means missing.** Every input is `Figure = number | null |
 *    undefined`, and anything that cannot be worked out returns `null`. §4:
 *    "Any rate with a zero or empty bottom number shows a dash, never an
 *    error or 0%." A dash says "we don't know"; a 0% says "we know, and it's
 *    nothing", and they are different sentences to show a client.
 *
 * 2. **Percentages are 0–100, not 0–1.** A 42% open rate is `42`. The client
 *    types 42 into the box, the benchmark prompt asks for "Email open rate
 *    %", and the mockups print 6.9%. Keeping one representation from the
 *    keyboard to the screen removes the only place a hundredfold error can
 *    hide. Ratios (ROAS) stay ratios: 2.1 means 2.1.
 *
 * 3. **Money is ex-VAT**, per §13. Nothing here adds or removes tax; it is
 *    the figures that go in that must be net.
 */

export type Figure = number | null | undefined;

/** A worked-out value, or null when it cannot honestly be produced. */
export type Result = number | null;

function known(value: Figure): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The one place division happens.
 *
 * Null when either side is missing, or when the bottom is zero. Every rate in
 * the brief goes through here, which is why divide-by-zero is a property of
 * the module rather than something each formula has to remember.
 */
export function divide(top: Figure, bottom: Figure): Result {
  if (!known(top) || !known(bottom) || bottom === 0) return null;
  return top / bottom;
}

/** A percentage of a whole, as a 0–100 number. */
export function percentage(part: Figure, whole: Figure): Result {
  const ratio = divide(part, whole);
  return ratio === null ? null : ratio * 100;
}

/** Adds what is there, ignoring what is not. Null only if nothing is known. */
export function sum(...values: Figure[]): Result {
  const present = values.filter(known);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

/** Subtraction that stays honest about missing inputs. */
export function difference(a: Figure, b: Figure): Result {
  return known(a) && known(b) ? a - b : null;
}

/** Multiplication, same. */
export function product(a: Figure, b: Figure): Result {
  return known(a) && known(b) ? a * b : null;
}

/**
 * §4: "Month-on-month change = (this month − last month) ÷ last month",
 * as a percentage.
 */
export function monthOnMonthChange(thisMonth: Figure, lastMonth: Figure): Result {
  if (!known(thisMonth) || !known(lastMonth)) return null;
  return percentage(thisMonth - lastMonth, lastMonth);
}

// ---------------------------------------------------------------------------
// 5.2 Social Media
// ---------------------------------------------------------------------------

export const social = {
  /** Followers now − followers last month. A number of people, not a rate. */
  netFollowerGrowth: (now: Figure, lastMonth: Figure): Result =>
    difference(now, lastMonth),

  followerGrowthPercent: (now: Figure, lastMonth: Figure): Result =>
    percentage(difference(now, lastMonth), lastMonth),

  /**
   * (Likes + comments + saves + shares) ÷ reach.
   *
   * Saves and shares are IN it. The approved mockup prints 6.9% for figures
   * that give 9.3% by this formula — it appears to have used likes and
   * comments alone (12,640 ÷ 184,500 = 6.85%). The brief's formula is what is
   * built; the mockup is wrong, the same way §12 already records its launch
   * planner figure being wrong.
   */
  engagementRate: (input: {
    likesAndComments: Figure;
    saves: Figure;
    shares: Figure;
    reach: Figure;
  }): Result =>
    percentage(
      sum(input.likesAndComments, input.saves, input.shares),
      input.reach,
    ),

  saveRate: (saves: Figure, reach: Figure): Result => percentage(saves, reach),

  shareRate: (shares: Figure, reach: Figure): Result => percentage(shares, reach),

  reachPerPost: (reach: Figure, postsPublished: Figure): Result =>
    divide(reach, postsPublished),

  profileVisitToFollow: (followsGained: Figure, profileVisits: Figure): Result =>
    percentage(followsGained, profileVisits),

  /**
   * §5.2: reach from non-followers ÷ (from followers + from non-followers).
   * How far content travels past the existing audience.
   */
  nonFollowerReachPercent: (
    fromNonFollowers: Figure,
    fromFollowers: Figure,
  ): Result =>
    percentage(fromNonFollowers, sum(fromFollowers, fromNonFollowers)),
};

// ---------------------------------------------------------------------------
// 5.3 Trial Reels
// ---------------------------------------------------------------------------

export const trialReels = {
  averageViewsPerReel: (totalViews: Figure, reelsPosted: Figure): Result =>
    divide(totalViews, reelsPosted),

  /** New followers ÷ total views × 1,000. */
  followsPer1kViews: (newFollowers: Figure, totalViews: Figure): Result => {
    const per = divide(newFollowers, totalViews);
    return per === null ? null : per * 1000;
  },

  profileVisitToFollowRate: (newFollowers: Figure, profileVisits: Figure): Result =>
    percentage(newFollowers, profileVisits),

  followersPerHour: (newFollowers: Figure, hoursSpent: Figure): Result =>
    divide(newFollowers, hoursSpent),

  /**
   * Hours ÷ buyers. Buyers lag by weeks or months (§5.3), so a month with
   * hours and no buyers yet is a dash, not an infinity.
   */
  hoursPerBuyer: (hoursSpent: Figure, buyers: Figure): Result =>
    divide(hoursSpent, buyers),

  /**
   * §5.3's profile check: visits are healthy but they are not following.
   * Returns the fixed note, or null when there is nothing to say.
   */
  profileCheckNote: (
    profileVisitToFollowRate: Figure,
    benchmark: Figure,
  ): string | null =>
    known(profileVisitToFollowRate) && known(benchmark) &&
    profileVisitToFollowRate < benchmark
      ? "People are visiting your profile but not following. Check your bio, highlights and pinned posts."
      : null,

  /**
   * §5.3: a hook or b-roll in the top 3 in two or more months is "Proven".
   * Compares on the text itself, which is what the client recognises.
   */
  provenItems: (items: { body: string; month: string }[]): string[] => {
    const months = new Map<string, Set<string>>();
    for (const item of items) {
      const key = item.body.trim().toLowerCase();
      if (!months.has(key)) months.set(key, new Set());
      months.get(key)!.add(item.month);
    }
    return [...months.entries()]
      .filter(([, m]) => m.size >= 2)
      .map(([key]) => key);
  },
};

// ---------------------------------------------------------------------------
// 5.4 Email
// ---------------------------------------------------------------------------

export const email = {
  netListGrowth: (now: Figure, lastMonth: Figure): Result =>
    difference(now, lastMonth),

  /** Unsubscribes ÷ list size LAST month — the list they were sent to. */
  unsubscribeRate: (unsubscribes: Figure, listSizeLastMonth: Figure): Result =>
    percentage(unsubscribes, listSizeLastMonth),

  /**
   * Click rate ÷ open rate. Both are already percentages, so this is a
   * percentage OF a percentage, not of a count.
   */
  clickToOpenRate: (clickRate: Figure, openRate: Figure): Result =>
    percentage(clickRate, openRate),

  revenuePerSubscriber: (revenueFromEmail: Figure, listSize: Figure): Result =>
    divide(revenueFromEmail, listSize),

  /**
   * §10.3: HeyClients reports counts, not rates, so the entry page accepts
   * either. This is the second way in.
   */
  ratesFromCounts: (input: {
    opens: Figure;
    clicks: Figure;
    emailsSent: Figure;
  }): { openRate: Result; clickRate: Result } => ({
    openRate: percentage(input.opens, input.emailsSent),
    clickRate: percentage(input.clicks, input.emailsSent),
  }),
};

// ---------------------------------------------------------------------------
// 5.5 Funnels
// ---------------------------------------------------------------------------

export const funnels = {
  optInRate: (optIns: Figure, landingPageViews: Figure): Result =>
    percentage(optIns, landingPageViews),

  salesPageConversion: (purchases: Figure, salesPageViews: Figure): Result =>
    percentage(purchases, salesPageViews),

  checkoutCompletion: (purchases: Figure, checkoutsStarted: Figure): Result =>
    percentage(purchases, checkoutsStarted),

  overallConversion: (purchases: Figure, landingPageViews: Figure): Result =>
    percentage(purchases, landingPageViews),

  /** Purchases × the linked offer's price. */
  revenue: (purchases: Figure, linkedOfferPrice: Figure): Result =>
    product(purchases, linkedOfferPrice),

  revenuePerVisitor: (funnelRevenue: Figure, landingPageViews: Figure): Result =>
    divide(funnelRevenue, landingPageViews),

  orderBumpTakeRate: (orderBumps: Figure, purchases: Figure): Result =>
    percentage(orderBumps, purchases),

  upsellTakeRate: (upsells: Figure, purchases: Figure): Result =>
    percentage(upsells, purchases),
};

// ---------------------------------------------------------------------------
// 5.6 Leads & Conversions
// ---------------------------------------------------------------------------

export interface LeadSources {
  social: Figure;
  email: Figure;
  ads: Figure;
  referral: Figure;
  other: Figure;
}

export const leads = {
  total: (sources: LeadSources): Result =>
    sum(sources.social, sources.email, sources.ads, sources.referral, sources.other),

  /** Each source as a percentage of the total. */
  sourceSplit: (sources: LeadSources): Record<keyof LeadSources, Result> => {
    const total = leads.total(sources);
    return {
      social: percentage(sources.social, total),
      email: percentage(sources.email, total),
      ads: percentage(sources.ads, total),
      referral: percentage(sources.referral, total),
      other: percentage(sources.other, total),
    };
  },

  callShowUpRate: (callsHeld: Figure, callsBooked: Figure): Result =>
    percentage(callsHeld, callsBooked),

  closeRate: (newClients: Figure, callsHeld: Figure): Result =>
    percentage(newClients, callsHeld),

  leadToClientRate: (newClients: Figure, totalLeads: Figure): Result =>
    percentage(newClients, totalLeads),
};

// ---------------------------------------------------------------------------
// 5.7 Ads
// ---------------------------------------------------------------------------

export type CampaignGoal = "leads" | "sales" | "profile_visits" | "traffic" | "awareness";

export interface AdCampaign {
  name: string;
  goal: CampaignGoal;
  spend: Figure;
  leads?: Figure;
  purchases?: Figure;
}

export const ads = {
  /** Spend ÷ impressions × 1,000. */
  cpm: (spend: Figure, impressions: Figure): Result => {
    const per = divide(spend, impressions);
    return per === null ? null : per * 1000;
  },

  ctr: (linkClicks: Figure, impressions: Figure): Result =>
    percentage(linkClicks, impressions),

  cpc: (spend: Figure, linkClicks: Figure): Result => divide(spend, linkClicks),

  costPerLead: (spend: Figure, leadCount: Figure): Result => divide(spend, leadCount),

  costPerAcquisition: (spend: Figure, purchases: Figure): Result =>
    divide(spend, purchases),

  roas: (revenueFromAds: Figure, spend: Figure): Result => divide(revenueFromAds, spend),

  /**
   * §5.7 and §10.2: cost per lead counts only spend from campaigns meant to
   * get leads or sales, so awareness spend does not distort it.
   *
   * The §10.2 sample is the worked case: £600 total spend over 100 leads is
   * £6.00, but £150 of that went on two profile-visit campaigns. Over the
   * three lead campaigns (£450) it is £4.50 — which is the number that means
   * something.
   *
   * Those figures are invented, like every worked example in the brief. The
   * shape is real and came from a client's own Meta export; the numbers are
   * not theirs, because this repository is public (Dom, 5 October 2026).
   */
  leadGoalSpend: (campaigns: AdCampaign[]): Result =>
    sum(
      ...campaigns
        .filter((c) => c.goal === "leads" || c.goal === "sales")
        .map((c) => c.spend),
    ),

  costPerLeadFromLeadCampaigns: (campaigns: AdCampaign[], leadCount: Figure): Result =>
    divide(ads.leadGoalSpend(campaigns), leadCount),
};

// ---------------------------------------------------------------------------
// 5.8 Client Experience & Retention
// ---------------------------------------------------------------------------

export const clientExperience = {
  activeClientsAtEnd: (start: Figure, newClients: Figure, left: Figure): Result => {
    const gained = sum(start, newClients);
    return difference(gained, left);
  },

  retentionRate: (start: Figure, left: Figure): Result =>
    percentage(difference(start, left), start),

  churnRate: (left: Figure, start: Figure): Result => percentage(left, start),

  upsellRate: (renewalsAndUpsells: Figure, start: Figure): Result =>
    percentage(renewalsAndUpsells, start),

  /** Issues ÷ active clients at end × 10. */
  issuesPer10Clients: (issuesRaised: Figure, activeClientsAtEnd: Figure): Result => {
    const per = divide(issuesRaised, activeClientsAtEnd);
    return per === null ? null : per * 10;
  },

  /**
   * 1 ÷ average monthly churn over the last 12 months, in months.
   *
   * §5.8: "shown once 3 months of data exist". Fewer than three months of
   * churn returns null rather than a confident number from one data point.
   * Churn rates go in as percentages, so the average is converted back.
   */
  averageClientLifetime: (monthlyChurnRates: Figure[]): Result => {
    const present = monthlyChurnRates.filter(known);
    if (present.length < 3) return null;
    const meanPercent = present.reduce((a, b) => a + b, 0) / present.length;
    // A business that lost nobody has no finite churn to invert.
    return meanPercent === 0 ? null : divide(1, meanPercent / 100);
  },
};

// ---------------------------------------------------------------------------
// 5.9 Offers
// ---------------------------------------------------------------------------

export interface OfferMonth {
  name: string;
  /** From the offer's setup, not typed each month. */
  hourlyCost: Figure;
  pricingModel?: "one_off" | "recurring";
  unitsSold: Figure;
  revenue: Figure;
  hoursSpent: Figure;
  otherDirectCosts?: Figure;
}

export const offers = {
  /** Hours × hourly cost + other direct costs. */
  deliveryCost: (offer: OfferMonth): Result => {
    const labour = product(offer.hoursSpent, offer.hourlyCost);
    if (labour === null) return null;
    return labour + (known(offer.otherDirectCosts) ? offer.otherDirectCosts : 0);
  },

  /** (Revenue − delivery cost) ÷ revenue. */
  margin: (offer: OfferMonth): Result => {
    const cost = offers.deliveryCost(offer);
    return percentage(difference(offer.revenue, cost), offer.revenue);
  },

  /** (Revenue − other direct costs) ÷ hours. Labour cost is NOT deducted. */
  effectiveHourlyRate: (offer: OfferMonth): Result => {
    if (!known(offer.revenue)) return null;
    const net = offer.revenue - (known(offer.otherDirectCosts) ? offer.otherDirectCosts : 0);
    return divide(net, offer.hoursSpent);
  },

  shareOfTotalRevenue: (offerRevenue: Figure, totalRevenue: Figure): Result =>
    percentage(offerRevenue, totalRevenue),

  conversionByOffer: (unitsSold: Figure, linkedFunnelLandingViews: Figure): Result =>
    percentage(unitsSold, linkedFunnelLandingViews),

  // --- the four summary cards of §5.9 ---

  totalRevenue: (all: OfferMonth[]): Result => sum(...all.map((o) => o.revenue)),

  totalHours: (all: OfferMonth[]): Result => sum(...all.map((o) => o.hoursSpent)),

  /**
   * (Total revenue − total delivery cost) ÷ total revenue.
   *
   * §5.9 is explicit: weighted, "so bigger offers count for more. Not a
   * simple average of the offer margins."
   */
  overallMargin: (all: OfferMonth[]): Result => {
    const revenue = offers.totalRevenue(all);
    const cost = sum(...all.map((o) => offers.deliveryCost(o)));
    return percentage(difference(revenue, cost), revenue);
  },

  /** (Total revenue − total other direct costs) ÷ total hours. */
  overallEffectiveHourlyRate: (all: OfferMonth[]): Result => {
    const revenue = offers.totalRevenue(all);
    const other = sum(...all.map((o) => o.otherDirectCosts ?? 0));
    return divide(difference(revenue, other ?? 0), offers.totalHours(all));
  },

  /** Monthly recurring revenue: the revenue from recurring offers only. */
  monthlyRecurringRevenue: (all: OfferMonth[]): Result =>
    sum(...all.filter((o) => o.pricingModel === "recurring").map((o) => o.revenue)),
};

// ---------------------------------------------------------------------------
// 5.10 Financials
// ---------------------------------------------------------------------------

export interface FinancialsMonth {
  revenueFromOffers: Figure;
  otherIncome?: Figure;
  fixedCosts: Figure;
  variableCosts: Figure;
  teamCosts: Figure;
  investmentSpend?: Figure;
  cashInBank: Figure;
}

export const financials = {
  totalRevenue: (m: FinancialsMonth): Result =>
    sum(m.revenueFromOffers, m.otherIncome),

  totalCosts: (m: FinancialsMonth): Result =>
    sum(m.fixedCosts, m.variableCosts, m.teamCosts, m.investmentSpend),

  profit: (m: FinancialsMonth): Result =>
    difference(financials.totalRevenue(m), financials.totalCosts(m)),

  profitMargin: (m: FinancialsMonth): Result =>
    percentage(financials.profit(m), financials.totalRevenue(m)),

  costsAsPercentOfRevenue: (m: FinancialsMonth): Result =>
    percentage(financials.totalCosts(m), financials.totalRevenue(m)),

  /**
   * Cash in bank ÷ average monthly costs over the last 3 months, in months.
   * Fewer than three months of costs is not an average worth acting on.
   */
  runway: (cashInBank: Figure, lastThreeMonthsCosts: Figure[]): Result => {
    const present = lastThreeMonthsCosts.filter(known);
    if (present.length < 3) return null;
    const average = present.reduce((a, b) => a + b, 0) / present.length;
    return divide(cashInBank, average);
  },
};

// ---------------------------------------------------------------------------
// 6. Launches
// ---------------------------------------------------------------------------

export interface LaunchPriceOption {
  name: string;
  /** Full contract value — §6.4 counts payment plans at full value. */
  price: Figure;
  sales: Figure;
  isMain?: boolean;
}

export const launch = {
  showUpRate: (dayOneAttendees: Figure, signUps: Figure): Result =>
    percentage(dayOneAttendees, signUps),

  dayDropOff: (dayAttendees: Figure, dayOneAttendees: Figure): Result =>
    percentage(dayAttendees, dayOneAttendees),

  pitchRetention: (liveAtEndOfPitch: Figure, liveAtStart: Figure): Result =>
    percentage(liveAtEndOfPitch, liveAtStart),

  percentOfSignUpGoal: (signUps: Figure, signUpGoal: Figure): Result =>
    percentage(signUps, signUpGoal),

  totalSales: (options: LaunchPriceOption[]): Result =>
    sum(...options.map((o) => o.sales)),

  /** Sum of (sales × price) per option, payment plans at full contract value. */
  totalRevenue: (options: LaunchPriceOption[]): Result =>
    sum(...options.map((o) => product(o.sales, o.price))),

  revenueStillToCollect: (totalRevenue: Figure, cashCollected: Figure): Result =>
    difference(totalRevenue, cashCollected),

  averageOrderValue: (totalRevenue: Figure, totalSales: Figure): Result =>
    divide(totalRevenue, totalSales),

  percentOfGoal: (totalSales: Figure, goal: Figure): Result =>
    percentage(totalSales, goal),

  /** Total sales ÷ live attendees of the main selling stage. */
  conversionRate: (totalSales: Figure, mainStageLiveAttendees: Figure): Result =>
    percentage(totalSales, mainStageLiveAttendees),

  /** §6.4: sales by source must add up to total sales; the form warns if not. */
  sourcesReconcile: (bySource: Figure[], totalSales: Figure): boolean => {
    const counted = sum(...bySource);
    return counted !== null && known(totalSales) && counted === totalSales;
  },

  /**
   * §6.3: "average open and click rate per stage".
   *
   * A plain mean of the stage's emails, NOT weighted by list size — §6.3
   * asks for the average of the rates, and each email in a sequence goes to
   * broadly the same list anyway. Missing emails are skipped rather than
   * counted as zero, so a stage with one unrecorded email does not report
   * half its real open rate.
   */
  averageRatePerStage: (ratesPercent: Figure[]): Result => {
    const present = ratesPercent.filter(known);
    if (present.length === 0) return null;
    return present.reduce((a, b) => a + b, 0) / present.length;
  },

  replyRate: (replies: Figure, dmsSent: Figure): Result => percentage(replies, dmsSent),

  callToCloseRate: (closed: Figure, salesCallsBooked: Figure): Result =>
    percentage(closed, salesCallsBooked),

  costPerSignUp: (adSpend: Figure, signUps: Figure): Result => divide(adSpend, signUps),

  costPerSale: (adSpend: Figure, totalSales: Figure): Result =>
    divide(adSpend, totalSales),

  roas: (totalRevenue: Figure, adSpend: Figure): Result => divide(totalRevenue, adSpend),

  /**
   * §6.6, the launch planner. Works backwards from a sales goal.
   *
   *   live attendees needed = sales goal ÷ conversion rate
   *   sign-ups needed       = live attendees needed ÷ show-up rate
   *
   * Always rounded up: you cannot half-fill a seat, and rounding down plans
   * for a launch that misses.
   *
   * Rates go in as percentages, like everywhere else here. The brief's worked
   * check: 30 sales at 5% needs 600 live attendees; at 47% show-up that is
   * 1,277 sign-ups. The approved mockup says 600 sign-ups, which is wrong —
   * §12 records it and says to build to the formula.
   */
  planner: (input: {
    salesGoal: Figure;
    conversionRatePercent: Figure;
    showUpRatePercent: Figure;
  }): { liveAttendeesNeeded: Result; signUpsNeeded: Result } => {
    const attendees = divide(input.salesGoal, divide(input.conversionRatePercent, 100));
    const liveAttendeesNeeded = attendees === null ? null : Math.ceil(attendees);

    const signUps = divide(liveAttendeesNeeded, divide(input.showUpRatePercent, 100));
    return {
      liveAttendeesNeeded,
      signUpsNeeded: signUps === null ? null : Math.ceil(signUps),
    };
  },
};

// ---------------------------------------------------------------------------
// 7. Traffic lights
// ---------------------------------------------------------------------------

export type TrafficLight = "green" | "amber" | "red" | null;

export type GoodDirection = "up" | "down" | "none";

/**
 * §7's table, in order: "each metric uses the first rule that applies."
 *
 *   target, up is good     green ≥ 100% of target, amber 80–99%, red < 80%
 *   target, down is good   green ≤ target, amber up to 20% over, red beyond
 *   benchmark              green at or better, amber within 20%, red worse
 *   last month only        green better, amber within 5% either way, red worse
 *
 * A metric with no direction ("n/a" in §5 — spend, lead source split) gets no
 * light at all, because there is no such thing as a good amount of spend
 * without knowing what it bought.
 */
export function trafficLight(input: {
  value: Figure;
  target?: Figure;
  benchmark?: Figure;
  lastMonth?: Figure;
  goodDirection: GoodDirection;
}): TrafficLight {
  const { value, target, benchmark, lastMonth, goodDirection } = input;

  if (!known(value) || goodDirection === "none") return null;

  if (known(target) && target !== 0) {
    if (goodDirection === "up") {
      const ofTarget = (value / target) * 100;
      if (ofTarget >= 100) return "green";
      if (ofTarget >= 80) return "amber";
      return "red";
    }
    if (value <= target) return "green";
    return value <= target * 1.2 ? "amber" : "red";
  }

  if (known(benchmark) && benchmark !== 0) {
    const better = goodDirection === "up" ? value >= benchmark : value <= benchmark;
    if (better) return "green";
    const worseBy = Math.abs(value - benchmark) / Math.abs(benchmark);
    return worseBy <= 0.2 ? "amber" : "red";
  }

  if (known(lastMonth) && lastMonth !== 0) {
    const movement = (value - lastMonth) / Math.abs(lastMonth);
    const withinFive = Math.abs(movement) <= 0.05;
    if (withinFive) return "amber";
    const improved = goodDirection === "up" ? movement > 0 : movement < 0;
    return improved ? "green" : "red";
  }

  return null;
}

// ---------------------------------------------------------------------------
// 4. Year to date
// ---------------------------------------------------------------------------

/**
 * §4: "Year-to-date sums counts and money; rates are recalculated from the
 * year's totals, never averaged month by month."
 *
 * Averaging twelve monthly conversion rates gives every month equal weight,
 * so a quiet January with two leads and one client counts as much as a busy
 * September. This takes the totals and divides once.
 */
export function yearToDateTotal(monthlyValues: Figure[]): Result {
  return sum(...monthlyValues);
}

export function yearToDateRate(
  monthlyTops: Figure[],
  monthlyBottoms: Figure[],
): Result {
  return percentage(sum(...monthlyTops), sum(...monthlyBottoms));
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

/**
 * Every calculated metric in the seeded list, and what works it out.
 *
 * §9 puts one obligation on this module: the "Worked out for you" card and
 * the published report must never disagree, because both call the same
 * function. That only holds while every calc metric HAS one — and with 174
 * metrics generated out of the brief, the failure mode is a field arriving in
 * the spec and nothing noticing that nothing computes it.
 *
 * So this map is checked against the seed migration in formulas.test.ts, both
 * ways: a calc metric with no entry fails, and an entry for a metric that no
 * longer exists fails too.
 *
 * Be clear about what it does not do: an entry is a name, not a proof, so it
 * catches an absence rather than a wrong implementation. The worked examples
 * in the tests are what check the arithmetic.
 */
export const CALC_COVERAGE: Record<string, string> = {
  social_media_net_follower_growth: "social.netFollowerGrowth",
  social_media_follower_growth: "social.followerGrowthPercent",
  social_media_engagement_rate: "social.engagementRate",
  social_media_save_rate: "social.saveRate",
  social_media_share_rate: "social.shareRate",
  social_media_reach_per_post: "social.reachPerPost",
  social_media_profile_visit_to_follow: "social.profileVisitToFollow",
  social_media_non_follower_reach: "social.nonFollowerReachPercent",

  trial_reels_average_views_per_reel: "trialReels.averageViewsPerReel",
  trial_reels_follows_per_1k_views: "trialReels.followsPer1kViews",
  trial_reels_profile_visit_to_follow_rate: "trialReels.profileVisitToFollowRate",
  trial_reels_followers_per_hour: "trialReels.followersPerHour",
  trial_reels_hours_per_buyer: "trialReels.hoursPerBuyer",

  email_net_list_growth: "email.netListGrowth",
  email_unsubscribe_rate: "email.unsubscribeRate",
  email_click_to_open_rate: "email.clickToOpenRate",
  email_revenue_per_subscriber: "email.revenuePerSubscriber",

  funnels_opt_in_rate: "funnels.optInRate",
  funnels_sales_page_conversion: "funnels.salesPageConversion",
  funnels_checkout_completion: "funnels.checkoutCompletion",
  funnels_overall_conversion: "funnels.overallConversion",
  funnels_funnel_revenue: "funnels.revenue",
  funnels_revenue_per_visitor: "funnels.revenuePerVisitor",
  funnels_order_bump_take_rate: "funnels.orderBumpTakeRate",
  funnels_upsell_take_rate: "funnels.upsellTakeRate",

  leads_conversions_total_leads: "leads.total",
  leads_conversions_lead_source_split: "leads.sourceSplit",
  leads_conversions_call_show_up_rate: "leads.callShowUpRate",
  leads_conversions_close_rate: "leads.closeRate",
  leads_conversions_lead_to_client_rate: "leads.leadToClientRate",

  ads_cpm: "ads.cpm",
  ads_ctr: "ads.ctr",
  ads_cpc: "ads.cpc",
  // §10.2: the headline figure counts lead-goal campaigns only. ads.costPerLead
  // is the blended one, shown beside total spend.
  ads_cost_per_lead: "ads.costPerLeadFromLeadCampaigns",
  ads_cost_per_acquisition: "ads.costPerAcquisition",
  ads_roas: "ads.roas",

  client_experience_active_clients_at_end: "clientExperience.activeClientsAtEnd",
  client_experience_retention_rate: "clientExperience.retentionRate",
  client_experience_churn_rate: "clientExperience.churnRate",
  client_experience_upsell_rate: "clientExperience.upsellRate",
  client_experience_issues_per_10_clients: "clientExperience.issuesPer10Clients",
  client_experience_average_client_lifetime: "clientExperience.averageClientLifetime",

  offers_delivery_cost: "offers.deliveryCost",
  offers_margin: "offers.margin",
  offers_effective_hourly_rate: "offers.effectiveHourlyRate",
  offers_share_of_total_revenue: "offers.shareOfTotalRevenue",
  offers_conversion_by_offer: "offers.conversionByOffer",
  offers_total_revenue_from_offers: "offers.totalRevenue",
  offers_overall_margin: "offers.overallMargin",
  offers_total_hours_spent_delivering: "offers.totalHours",
  offers_overall_effective_hourly_rate: "offers.overallEffectiveHourlyRate",

  financials_total_revenue: "financials.totalRevenue",
  financials_total_costs: "financials.totalCosts",
  financials_profit: "financials.profit",
  financials_profit_margin: "financials.profitMargin",
  // Financials pulls it from the offers, which is where recurring is known.
  financials_monthly_recurring_revenue: "offers.monthlyRecurringRevenue",
  financials_costs_as_percent_of_revenue: "financials.costsAsPercentOfRevenue",
  financials_runway: "financials.runway",

  launches_show_up_rate: "launch.showUpRate",
  launches_day_by_day_drop_off: "launch.dayDropOff",
  launches_pitch_retention: "launch.pitchRetention",
  launches_percent_of_sign_up_goal: "launch.percentOfSignUpGoal",
  launches_average_open_rate_per_stage: "launch.averageRatePerStage",
  launches_average_click_rate_per_stage: "launch.averageRatePerStage",
  launches_total_sales: "launch.totalSales",
  launches_total_revenue: "launch.totalRevenue",
  launches_revenue_still_to_collect: "launch.revenueStillToCollect",
  launches_average_order_value: "launch.averageOrderValue",
  launches_percent_of_sales_goal: "launch.percentOfGoal",
  launches_conversion_rate: "launch.conversionRate",
  launches_reply_rate: "launch.replyRate",
  launches_call_to_close_rate: "launch.callToCloseRate",
  launches_cost_per_sign_up: "launch.costPerSignUp",
  launches_cost_per_sale: "launch.costPerSale",
  launches_launch_roas: "launch.roas",
  launches_live_attendees_needed: "launch.planner",
  launches_sign_ups_needed: "launch.planner",
};

/**
 * The metrics that are neither typed nor calculated, but read from somewhere
 * else (§5's "Pulled", and §4's "enter once, use everywhere").
 *
 * Separate from CALC_COVERAGE because they are a different kind of thing: a
 * calculated metric is arithmetic over this month's figures, a pulled one is
 * the same figure appearing on a second screen. Both are produced by
 * calculate(), and both are checked against the seed in formulas.test.ts.
 */
export const PULLED_COVERAGE: Record<string, string> = {
  leads_conversions_new_leads_from_ads: "ads_leads",
  client_experience_new_clients: "leads_conversions_new_clients",
  // §5.8, settled 5 Oct 2026: the opening figure is typed once and every
  // later month carries on from the month before. See client-flow.ts.
  client_experience_active_clients_at_start: "clientFlow.activeClientsAtStart",
  financials_revenue_from_offers: "offers.totalRevenue",
};

/**
 * Pulled metrics with nothing behind them yet, named rather than left to be
 * discovered.
 *
 * `client_experience_active_clients_at_start` is "last month's active at
 * end", which is last month's CALCULATED figure — and §5.8 also says "the
 * very first month asks for active clients at start as a one-off input".
 * Those two together need a field that is pulled in most months and typed in
 * one, which the schema currently refuses: report_values will not store a
 * pulled metric at all. It needs a decision from Nina rather than a guess,
 * and Client Experience is Stage 3, so it waits.
 */
export const PULLED_NOT_IMPLEMENTED: string[] = [];
