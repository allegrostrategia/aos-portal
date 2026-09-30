# aOS Reporting Tool: Full Build Brief

Sep 28, 2026 · @Nina

## 1. Purpose and users

A monthly business reporting tool inside aOS that works like a spreadsheet underneath and looks like a premium dashboard on top. It reports on the client's own business: their marketing, sales, clients and money. It never reports on Allegro's team, hours or delivery.

**Two ways it's used**

| Who | Who fills it in | What they get |
| --- | --- | --- |
| Retainer clients | Allegro team (Elize) | Their monthly report, with strategist notes from Nina |
| aOS members | The member, self-serve | A tool included in their membership, with their own reflections |
| Chiarezza attendees | The attendee, self-serve | Same as aOS members, time-limited to year end |

**Hard rules**

- **No AI anywhere in the tool.** Every insight comes from formulas and fixed rules. No API calls to Claude or any other model.
- **Numbers only, no people.** The tool stores counts and totals, never names, emails or phone numbers of the client's leads or customers. Named contact lists stay in the client's CRM.
- **No raw data export.** Clients view their data as a designed report. There is no CSV or spreadsheet download.
- **Nothing about Allegro's work.** No hours used, no contracted hours, no task lists. That stays in Portal.

## 2. Where it lives and who sees what

Built once, in aOS. Not in Portal, and not copied between the two. Retainer clients get a scoped aOS login that shows the reporting tool and nothing else.

| Role | Sees | Can do |
| --- | --- | --- |
| Admin (Nina) | Every client's report | Enter and edit data, write strategist notes, set targets and benchmarks |
| Team (Elize) | Retainer clients assigned to her | Pick a client, enter and edit their data, save drafts |
| Retainer client | Their own report only, no other aOS areas | View report, add their own comments |
| aOS member | Full aOS, reporting is one area | Enter their own data, set their own targets, write reflections |
| Chiarezza attendee | Reporting only | Same as aOS member, access ends on a set date |

**Build notes**

- Keep the tool self-contained: its own folder in the aOS codebase and its own database tables, all prefixed `report_` (the same pattern Weekly Pulse used with `pulse_`). That keeps it clean to lift into another app later if ever needed.
- Row-level security on every `report_` table so a client can only ever read their own rows. Team access is by assignment, not a blanket team role.
- Chiarezza access expiry: on the end date the login stops working. Data is kept, not deleted, so it's there if they join aOS later.

## 3. Design direction

Five approved mockup screens set the look: the Overview report, the Social Media data entry page, the Launches page, the Social Media report page and the Offers page. Build to match them, with one change: **no left sidebar**. Navigation is a horizontal row of category tabs under the page header, so it doesn't clash with the aOS menu.

**Brand**

| Token | Value | Use |
| --- | --- | --- |
| Navy | #073C8C | Headings, primary text, chart series |
| Orange | #FF6625 | Primary buttons, main accent, live states |
| Gold | #FFD551 | Progress bars, highlights |
| Sky Blue | #A4D3EB | Secondary chart series, icons |
| Blush | #FFB29E | Soft accents, icon backgrounds |
| Lemon Cream | #F8E6A0 | Calculated (read-only) cards |
| Off-White | #F3F5FD | Page background |

Headings in Recoleta (licensed files available from Nina) or Cormorant Garamond. Body text and all numbers in DM Sans or Inter, with tabular figures so columns of numbers line up.

**Patterns to reuse everywhere**

- White rounded cards on off-white, thin borders, soft shadows.
- KPI card: icon, label, big number, month-on-month change (green up arrow or red down arrow with %), small sparkline.
- Tab row: each tab shows a status marker on the entry screen (green tick complete, orange dot in progress, empty circle not started).
- Input fields show last month's figure in small grey text underneath.
- Calculated results sit in a lemon cream card marked "Worked out for you", clearly different from inputs, updating live as numbers are typed.
- Amalfi imagery stays in the page header only.
- Mobile: tab row scrolls sideways; cards stack to one column.

## 4. How it works

Every number moves through three layers, and only the first is typed by a person.

1. **Inputs.** Raw monthly numbers, typed in or filled from a CSV upload.
2. **Calculations.** Rates, growth, cost per result, margins, month-on-month change and year-to-date totals, all worked out by formulas in the app.
3. **Insights.** Targets, traffic lights and the "Look at these first" panel, driven by fixed rules (section 7).

**Rules the whole tool follows**

- **Enter once, use everywhere.** A number is typed in one place only. Revenue per offer adds up into Financials. Leads from ads feed Leads & Conversions. Sales from email feed Email and Offers.
- **Calculated values are never stored as typed fields.** They're worked out from inputs each time, so fixing an input fixes everything downstream.
- **Core and optional fields.** Each category has a short required core (the fields marked Core in section 5). Everything else sits behind "+ Add more detail (optional)".
- **Auto-hide.** A category with no data for a month doesn't appear in that month's report. No toggles needed.
- **Divide-by-zero safe.** Any rate with a zero or empty bottom number shows a dash, never an error or 0%.
- **Month-on-month change** = (this month − last month) ÷ last month. Shown as a green or red arrow depending on whether up is good for that metric.
- **Year-to-date** sums counts and money; rates are recalculated from the year's totals, never averaged month by month.
- **Currency** set per client (default £).

## 5. Category specs

Eleven areas: Overview, Social Media, Trial Reels, Email, Funnels, Leads & Conversions, Ads, Client Experience, Offers, Financials, and Launches (section 6). In each table, **Core** = required input, **Optional** = behind "Add more detail", **Calc** = worked out, never typed. "Good" is the direction that shows green.

### 5.1 Overview (report only, no inputs)

- Six KPI cards: Revenue, Profit, New Leads, New Clients, Email List Size, Instagram Followers. Each pulls from its own category.
- "Look at these first" panel (rules in section 7).
- Line chart: Revenue vs Profit, last 12 months.
- Bar chart: Leads by source this month.
- Target progress bars for up to 5 targeted metrics.
- Notes card (section 8).

### 5.2 Social Media (Instagram first; TikTok and LinkedIn added later using the same structure)

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| Followers at month end | Core |  | Up |
| Posts published | Core |  | Up |
| Reach | Core |  | Up |
| Views | Core |  | Up |
| Likes + comments | Core |  | Up |
| Saves | Core |  | Up |
| Shares | Core |  | Up |
| Follows gained | Optional |  | Up |
| Profile visits | Optional |  | Up |
| Link clicks | Optional |  | Up |
| DMs from content | Optional |  | Up |
| Keyword comments | Optional |  | Up |
| Net follower growth | Calc | Followers now − followers last month | Up |
| Follower growth % | Calc | Net growth ÷ followers last month | Up |
| Engagement rate | Calc | (Likes + comments + saves + shares) ÷ reach | Up |
| Save rate | Calc | Saves ÷ reach | Up |
| Share rate | Calc | Shares ÷ reach | Up |
| Reach per post | Calc | Reach ÷ posts published | Up |
| Profile visit to follow | Calc | Follows gained ÷ profile visits | Up |

Charts: follower line (12 months), reach and views bars, saves and shares trend.

**Also in Social Media** (from Meta's account overview): **Reach from followers** and **Reach from non-followers**, both optional inputs. Calculated: **Non-follower reach %** = reach from non-followers ÷ (reach from followers + reach from non-followers), good = up. It shows how far content travels beyond the existing audience (Emily, Sept 2026: 30,592 of 32,791, or 93%).

### 5.3 Trial Reels (optional area, signed off by Nina)

A top-level monthly summary only. No per-reel logging: that level of detail belongs to Allegro's Trial Reels package, not the client's report.

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| Trial reels posted | Core |  | Up |
| New followers from trial reels | Core |  | Up |
| Total views | Core |  | Up |
| Profile visits | Core |  | Up |
| Hours spent on trial reels | Core | Filming, editing and posting | Down |
| Buyers from trial reels | Optional | Anyone who bought and came from a trial reel | Up |
| Top 3 hooks | Core | Hook text, plus views for each | n/a |
| Top 3 b-roll | Optional | Short description, plus views for each | n/a |
| Average views per reel | Calc | Total views ÷ trial reels posted | Up |
| Follows per 1,000 views | Calc | New followers ÷ total views × 1,000 | Up |
| Profile visit to follow rate | Calc | New followers ÷ profile visits | Up |
| Followers per hour | Calc | New followers ÷ hours spent | Up |
| Hours per buyer | Calc | Hours spent ÷ buyers | Down |

**Profile check rule:** if profile visits are healthy but the profile visit to follow rate is below its benchmark, the report shows a fixed note: "People are visiting your profile but not following. Check your bio, highlights and pinned posts."

**Buyers note:** buyers from trial reels usually lag by weeks or months, so this is shown as a running year-to-date total as well as a monthly figure.

**Hooks and b-roll:** shown as this month's top 3 lists. A hook or b-roll that appears in the top 3 in two or more months is marked "Proven", so clients can see what keeps working over time.

### 5.4 Email

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| List size at month end | Core |  | Up |
| New subscribers | Core |  | Up |
| Unsubscribes | Core |  | Down |
| Emails sent | Core |  | Up |
| Average open rate | Core |  | Up |
| Average click rate | Core |  | Up |
| Sales from email | Optional |  | Up |
| Revenue from email | Optional |  | Up |
| Net list growth | Calc | List size now − list size last month | Up |
| Unsubscribe rate | Calc | Unsubscribes ÷ list size last month | Down |
| Click-to-open rate | Calc | Click rate ÷ open rate | Up |
| Revenue per subscriber | Calc | Revenue from email ÷ list size | Up |

Open and click rate can be entered as percentages, **or** as total opens and total clicks, in which case the rates are worked out as opens ÷ emails sent and clicks ÷ emails sent (see 10.3). The entry page offers a switch between the two.

### 5.5 Funnels (repeatable: one block per named funnel)

Each funnel is linked to one offer. Its purchases are a subset of that offer's sales (section 5.9), not extra sales, so nothing is counted twice.

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| Landing page views | Core |  | Up |
| Opt-ins | Core |  | Up |
| Sales page views | Optional |  | Up |
| Checkouts started | Optional |  | Up |
| Purchases | Core |  | Up |
| Opt-in rate | Calc | Opt-ins ÷ landing page views | Up |
| Sales page conversion | Calc | Purchases ÷ sales page views | Up |
| Checkout completion | Calc | Purchases ÷ checkouts started | Up |
| Overall conversion | Calc | Purchases ÷ landing page views | Up |
| Funnel revenue | Calc | Purchases × linked offer price | Up |
| Revenue per visitor | Calc | Funnel revenue ÷ landing page views | Up |

Chart: a funnel graphic per funnel (views, opt-ins, sales page, purchases, with the drop-off between each).

**Funnels are manual entry only**, no upload. Also included as optional fields: **Order bumps taken** and **Upsells taken**. Calculated: **Order bump take rate** = order bumps ÷ purchases, and **Upsell take rate** = upsells ÷ purchases (good = up). Money from bumps and upsells is recorded once, in Offers, by setting each bump or upsell up as its own offer.

### 5.6 Leads & Conversions

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| New leads from social | Core |  | Up |
| New leads from email | Core |  | Up |
| New leads from ads | Pulled | From Ads: leads | Up |
| New leads from referral | Core |  | Up |
| New leads from other | Optional |  | Up |
| Calls booked | Core |  | Up |
| Calls held | Core |  | Up |
| New clients | Core |  | Up |
| Total leads | Calc | Sum of all sources | Up |
| Lead source split | Calc | Each source ÷ total leads | n/a |
| Call show-up rate | Calc | Calls held ÷ calls booked | Up |
| Close rate | Calc | New clients ÷ calls held | Up |
| Lead to client rate | Calc | New clients ÷ total leads | Up |

Charts: leads by source bars, leads trend line (12 months).

### 5.7 Ads

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| Spend | Core |  | n/a |
| Impressions | Core |  | Up |
| Link clicks | Core |  | Up |
| Leads | Core |  | Up |
| Purchases | Core |  | Up |
| Revenue from ads | Core |  | Up |
| Reach | Optional |  | Up |
| CPM | Calc | Spend ÷ impressions × 1,000 | Down |
| CTR | Calc | Clicks ÷ impressions | Up |
| CPC | Calc | Spend ÷ clicks | Down |
| Cost per lead | Calc | Spend ÷ leads | Down |
| Cost per acquisition | Calc | Spend ÷ purchases | Down |
| ROAS | Calc | Revenue from ads ÷ spend | Up |

Campaign breakdown: the same core fields per named campaign, plus each campaign's goal (leads, sales, profile visits, traffic, awareness). Cost per lead and cost per acquisition only count spend from campaigns with a leads or sales goal, so awareness spend doesn't distort them (see 10.2).

### 5.8 Client Experience & Retention

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| Active clients at start | Pulled | Last month's active at end | n/a |
| New clients | Pulled | From Leads & Conversions | Up |
| Clients who left | Core |  | Down |
| Renewals and upsells | Core |  | Up |
| Issues raised | Core | Complaints, problems or things that went wrong for a client this month | Down |
| Testimonials received | Optional |  | Up |
| Programme completions | Optional |  | Up |
| Repeat engagers | Optional |  | Up |
| Active clients at end | Calc | Start + new − left | Up |
| Retention rate | Calc | (Start − left) ÷ start | Up |
| Churn rate | Calc | Left ÷ start | Down |
| Upsell rate | Calc | Renewals and upsells ÷ start | Up |
| Issues per 10 clients | Calc | Issues raised ÷ active clients at end × 10 | Down |
| Average client lifetime | Calc | 1 ÷ average monthly churn (last 12 months), shown once 3 months of data exist | Up |

No satisfaction score: testimonials and retention already show whether clients are happy. The notes box on this page is where the client records what the issues were and what they're fixing.

The very first month asks for active clients at start as a one-off input.

### 5.9 Offers (repeatable: one block per offer)

Set up once per offer: name, price, type (one-off or recurring), hourly cost of the client's own delivery time. Then each month:

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| Units sold | Core |  | Up |
| Revenue this month | Core | Cash actually received, so discounts and payment plans are right | Up |
| Hours spent delivering | Core |  | Down |
| Other direct costs | Optional | Tools, contractors, materials for this offer | Down |
| Delivery cost | Calc | Hours × hourly cost + other direct costs | Down |
| Margin | Calc | (Revenue − delivery cost) ÷ revenue | Up |
| Effective hourly rate | Calc | (Revenue − other direct costs) ÷ hours | Up |
| Share of total revenue | Calc | Offer revenue ÷ total revenue | n/a |
| Conversion by offer | Calc | Units sold ÷ linked funnel landing views (if a funnel is linked) | Up |

Any offer under the margin benchmark (default 45%, editable per client) gets an amber or red flag. Delivery cost here is for analysis only and is not added to the P&L, so costs aren't counted twice.

**Offers page summary cards** (approved mockup):

| Card | Formula | Good |
| --- | --- | --- |
| Total revenue from offers | Sum of all offers' revenue | Up |
| Overall margin | (Total revenue − total delivery cost) ÷ total revenue, so bigger offers count for more. Not a simple average of the offer margins | Up |
| Hours spent delivering | Sum of all offers' hours | Down |
| Effective hourly rate | (Total revenue − total other direct costs) ÷ total hours | Up |

**Target hourly rate:** an optional per-client setting in Offers setup. It shows as the dashed line on the "Effective hourly rate by offer" chart. For recurring offers, "Units sold" is labelled "Members" on the offer card.

### 5.10 Financials (full P&L)

| Field | Type | Formula | Good |
| --- | --- | --- | --- |
| Revenue from offers | Pulled | Sum of all offers' revenue | Up |
| Other income | Optional |  | Up |
| Fixed costs | Core | Subscriptions, rent, software | Down |
| Variable costs | Core | Ads, contractors, fees | Down |
| Team costs | Core | Salaries, VAs, freelancers | Down |
| Investment spend | Optional | Courses, coaching, events | n/a |
| Cash in bank at month end | Core |  | Up |
| Total revenue | Calc | Offers + other income | Up |
| Total costs | Calc | Fixed + variable + team + investment | Down |
| Profit | Calc | Total revenue − total costs | Up |
| Profit margin | Calc | Profit ÷ total revenue | Up |
| Monthly recurring revenue | Calc | Sum of revenue from recurring offers | Up |
| Costs as % of revenue | Calc | Total costs ÷ total revenue | Down |
| Runway | Calc | Cash in bank ÷ average monthly costs (last 3 months) | Up |

Charts: revenue vs profit line (12 months), cost breakdown donut, MRR trend.

## 6. Launches module

Each launch is its own record, and a client can add as many as they like. Launches are not tied to a single month: they have their own dates and their own report page. Built from Nina's existing launch tracker, with numbers only (no attendee names or contact details).

**Launches page layout (approved mockup):** launch cards across the top with status (Planning, Live now, Completed), total revenue, sales vs goal and a progress ring; the open launch below with its stage timeline, goal bar, KPI cards, attendance funnel, email open-rate chart, sales by source donut and launch planner. Buttons: "+ New launch", "Compare launches", "Edit launch details".

### 6.1 Setup

- Launch name, offer it sells (links to Offers), short description, cover image.
- **Stages**, added in order, each with a type (Challenge, Masterclass, Webinar, Workshop, Waitlist, Open Cart, Other), promo dates and live dates. A challenge sets its number of days.
- **Price options**, each with a name and price (e.g. Pay in full early bird, Payment plan, Pay in full normal). A payment plan also stores number of instalments and instalment amount.
- **Goals:** Good, Better and Best sales targets. Revenue for each = sales target × main price. Optional sign-up and live-attendance goals per stage.

### 6.2 Stage numbers (one block per stage)

| Field | Type | Formula |
| --- | --- | --- |
| Sign-ups | Core |  |
| Live attendees per day | Core | One field per live day |
| Replay watchers | Optional |  |
| Live at start / at pitch / at end of pitch | Optional (masterclass, webinar) |  |
| Show-up rate | Calc | Day 1 live attendees ÷ sign-ups |
| Day-by-day drop-off | Calc | Each day's attendees ÷ day 1 attendees |
| Pitch retention | Calc | Live at end of pitch ÷ live at start |
| % of sign-up goal | Calc | Sign-ups ÷ sign-up goal |

### 6.3 Emails (one block per stage)

Per email: list size sent to, open rate, click rate, unique clicks. Calculated: average open and click rate per stage, and a line chart of open rate across the whole sequence with each stage in its own colour.

### 6.4 Sales

| Field | Type | Formula |
| --- | --- | --- |
| Sales per price option | Core |  |
| Sales by source (stage, email, DM, ads, referral, unknown) | Core | Must add up to total sales; the form warns if not |
| Cash collected to date | Core |  |
| Total sales | Calc | Sum of sales per price option |
| Total revenue | Calc | Sum of (sales × price) per option, payment plans at full contract value |
| Revenue still to collect | Calc | Total revenue − cash collected |
| Average order value | Calc | Total revenue ÷ total sales |
| % of each goal | Calc | Total sales ÷ Good, Better and Best targets |
| Conversion rate | Calc | Total sales ÷ live attendees of the main selling stage |

### 6.5 Pipeline and ads

Pipeline counts: DMs sent, replies, discovery calls, sales calls booked, closed, not interested. Ads: spend, leads, sales. Calculated: reply rate, call-to-close rate, cost per sign-up (spend ÷ sign-ups), cost per sale (spend ÷ total sales), launch ROAS (total revenue ÷ spend).

### 6.6 Launch planner

Works backwards from a sales goal. For a first launch the client enters their expected show-up and conversion rates (defaults editable). For later launches it offers their real rates from a previous launch.

```latex
\text{Live attendees needed} = \frac{\text{Sales goal}}{\text{Conversion rate}} \qquad \text{Sign-ups needed} = \frac{\text{Live attendees needed}}{\text{Show-up rate}}
```

Worked check: 30 sales at 5% conversion needs 600 live attendees; at 47% show-up that's 1,277 sign-ups (always round up). Note: the approved mockup shows 600 sign-ups, which is wrong. Build to this formula, not the mockup.

### 6.7 Compare launches

Pick any two launches and see them side by side: sign-ups, show-up rate, pitch retention, conversion rate, total sales, revenue, average order value, cost per sale, ROAS. Differences shown as up or down arrows.

## 7. Targets, benchmarks and traffic lights

These rules do the job an AI summary would have done, using plain maths the client can trust.

**Targets.** Set per client, per metric, at onboarding and editable any time. Retainer clients' targets are set by Allegro; aOS members set their own. A target can be one monthly figure or change by month.

**Benchmarks.** Set per client for their own niche, not one default set, because clients range well beyond coaching. They're captured in first-time setup:

1. The client answers three setup questions: what their business does, their main offers, and their country.
2. The app builds a ready-made prompt from those answers (plain text templating, no AI in aOS) with a "Copy prompt" button.
3. The client pastes it into ChatGPT or Claude outside aOS, and gets back a list of industry averages for their niche.
4. They paste the AI's reply into a box in aOS. Because the prompt asks for a fixed "Label: number" format, the app reads each line and fills the matching benchmark fields for them to check and save. They can also type values in by hand.

For retainer clients, Allegro does the same during onboarding. Benchmarks stay editable any time. If a client has none set for a metric, its traffic light compares against last month instead.

**The prompt** (square brackets filled in by the app):

```
I run a [business description] business selling [main offers], mainly in [country]. For a small business like mine in this niche, give me realistic industry average benchmarks for each metric below. Use figures for small businesses, not big brands. Reply with ONLY the list below, in the same order and wording, with one number after each colon and no other text. If you're not sure, give your best estimate.

Email open rate %:
Email click rate %:
Email unsubscribe rate per month %:
Instagram engagement rate as % of reach:
Instagram save rate as % of reach:
Profile visit to follow rate %:
Funnel opt-in rate %:
Call show-up rate %:
Close rate from calls to new clients %:
Ads return on ad spend:
Offer profit margin %:
Monthly client retention rate %:
Launch or webinar show-up rate %:
```

**Traffic lights** (each metric uses the first rule that applies):

| Compared against | Green | Amber | Red |
| --- | --- | --- | --- |
| Target (up is good) | 100% of target or more | 80% to 99% | Under 80% |
| Target (down is good) | At or under target | Up to 20% over | More than 20% over |
| Benchmark | At or better than benchmark | Within 20% of it | Worse by more than 20% |
| Last month only | Better than last month | Within 5% either way | Worse by more than 5% |

**"Look at these first" panel** (three cards on the Overview):

1. Take every metric with data this month and last month.
2. Ignore tiny numbers: skip count metrics where last month was under 10, so 2 to 1 doesn't show as a 50% drop.
3. Rank: metrics red against a target first, then the biggest move in the bad direction.
4. Show the top 3, each with a one-line note from a template: "3 fewer new clients than last month" or "Email sign-ups are at 73% of your target".
5. If nothing got worse, the panel becomes "What went well" and shows the three biggest improvements instead.

## 8. Notes and commentary

Written words come from people, never generated.

| Note | Retainer clients | aOS members |
| --- | --- | --- |
| Main note on Overview | "Notes from your strategist", written by Nina, signed with her name | "Your reflections this month", written by the member |
| Per-category notes | Observations and recommendations from Elize or Nina | The member's own notes box on each entry page |
| Next month's focus | Up to 3 objectives set by Nina | Up to 3 objectives set by the member |
| Client reply | A comment box so the client can respond to the report | Not needed |

A report for a retainer client has two states: **Draft** (only the team sees it) and **Published** (the client sees it). The client is emailed when it's published. Self-serve reports have no draft state; they're always visible to the member.

### 8.1 aOS members: completion and reminders

aOS members fill in every category themselves, Financials included. Allegro enters nothing for them.

- **Hiding a category.** A member can hide any category they don't want to use. Hidden categories don't count towards completion and don't appear in their report.
- **Admin view.** Nina sees a list of members with each one's report status for the month and which categories they've hidden, so she can raise it with them.
- **Unfinished tabs stay orange.** Any visible category without its core fields filled keeps its orange marker until it's done.
- **"Done"** means every visible category has its core fields filled for that month.

**Reminders** (notifications on the Piazza in aOS, two only):

1. **1st of the month:** "Time to fill in your report for \[last month\]."
2. **8th of the month**, only if the report isn't done: "Don't forget to fill in your monthly report for \[last month\]."

No further reminders after that. Retainer clients don't get these, because Allegro fills in their data.

## 9. Data model

Monthly numbers are stored one value per row (business, month, metric), not one wide table per category. That means a new field or a new category is a new row in the metric list, not a database change.

| Table | Holds |
| --- | --- |
| `report_workspaces` | One per business being reported on: linked aOS account, business name, currency, first month, access end date (Chiarezza), setup answers for the benchmark prompt (business description, main offers, country), hidden categories, target hourly rate |
| `report_access` | Who can see or edit which workspace, and in what role |
| `report_metrics` | The master list of fields: key, category, label, core or optional, unit, good direction. Seeded from section 5 |
| `report_entities` | Repeatable things: offers (price, one-off or recurring, hourly cost), funnels (linked offer), ad campaigns (goal), social platforms |
| `report_values` | Every typed number: workspace, month, metric, entity (if any), value, source (manual or CSV), who entered it, when |
| `report_periods` | Per workspace per month: Draft or Published, date published |
| `report_targets` | Workspace, metric, entity (if any), month (or all months), target value |
| `report_benchmarks` | Workspace, metric, value (set per client, section 7) |
| `report_notes` | Workspace, month, category (or overview), type (strategist, reflection, objective, client reply), author, text |
| `report_launches` | Launch name, offer, description, status, cover image, goals |
| `report_launch_stages` | Launch, order, type, promo dates, live dates, number of days, stage goals |
| `report_launch_prices` | Launch, option name, price, instalments |
| `report_launch_values` | Launch, stage, day or email number (if any), metric, value |
| `report_top_items` | Trial Reels top 3 lists: workspace, month, type (hook or b-roll), rank, text, views |
| `report_csv_imports` | File name, platform, month, who uploaded, fields filled. Plus report\_column\_maps (workspace, platform, column name, maps to field: saves each client's custom conversion choices, 10.2) and report\_reminders (workspace, month, reminder 1 or 2, sent at: stops duplicate Piazza notifications, 8.1) |

**Calculated values are not stored.** All formulas live in one shared code module used by both the entry screen and the report, so the "Worked out for you" card and the published report can never disagree. Every formula gets a unit test using the worked examples in this brief.

Unique rule on `report_values`: one value per workspace + month + metric + entity. Saving again updates it rather than adding a duplicate.

## 10. CSV import

Manual entry is the default and always works. CSV upload is a shortcut that fills fields for the person to check before saving.

1. The person drops a file on the upload card on an entry page.
2. The app reads the column headers in the browser, matches them to fields using a saved column map for that platform, and fills the matching boxes.
3. Filled boxes are highlighted so the person can see what came from the file. Nothing saves until they press Save.
4. Columns the app doesn't recognise are ignored, and the person is told which fields it couldn't fill.

**Platforms in the first build** (status as of 29 Sept):

| Export | Fills | Status |
| --- | --- | --- |
| Meta Business Suite content export | Social Media | In first build |
| Meta Ads Manager export | Ads | In first build |
| HeyClients / GoHighLevel email export | Email | Manual entry for now: sample was a PDF dashboard, no data export yet (10.3) |
| ActiveCampaign email export | Email | Parked: no sample yet, manual entry until one is supplied |
| Kit, Flodesk | Email | Parked: added when a client using them joins, built from that client's first export |

**Financials is manual entry only.** No Stripe exports and no bank statement uploads. Payment exports carry customers' names, emails and card details, which breaks the numbers-only rule and puts personal data through aOS. Clients type their totals by hand.

The file itself is never stored, only the numbers taken from it. Platforms rename columns without warning, so each column map should be easy to update from a fresh sample file.

### 10.1 Meta Business Suite content export (sample received 29 Sept, one row per post)

Columns: Post ID, Account ID, Account username, Account name, Description, Duration (sec), Publish time, Permalink, Post type, Data comment, Date, Views, Reach, Likes, Shares, Follows, Comments, Saves.

| Our field | From the file | How |
| --- | --- | --- |
| Posts published | Row count | Count rows whose Publish time falls in the report month |
| Views | Views | Sum |
| Likes + comments | Likes, Comments | Sum both |
| Shares | Shares | Sum |
| Saves | Saves | Sum |
| Follows gained | Follows | Sum. Only counts follows Meta credits to a specific post, so it's usually lower than real follows. Label it "Follows from posts" |
| Reach | Reach | **Do not sum into account reach.** Summed post reach doesn't match account reach in either direction: it double counts people who saw several posts, and it misses reach from stories and older posts. Emily's September sample: posts summed to 17,011, account reach was 32,700. Fill reach from the account-level (Overview) export instead, or type it in |

**Rules for this file**

- Dates are US format (MM/DD/YYYY). Parse them as month first.
- Figures are lifetime totals up to the export date, not just that month. Tell clients to export in the first week of the following month, and only count posts published in the report month.
- Ignore Description, Permalink and IDs. Captions are never stored.
- Not in this file, so manual or from the Overview export: followers at month end, account reach, profile visits, link clicks, DMs from content, keyword comments.
- The file doesn't mark which reels were trial reels, so it can't fill the Trial Reels area. That stays manual.

### 10.2 Meta Ads Manager campaign export (sample received 29 Sept, one row per campaign)

Sample: Emily Samson, 1 to 28 Sept 2026, 9 campaigns (5 delivered, 4 inactive with all zeros). No summary row. Dates are ISO format (YYYY-MM-DD), unlike the content export.

| Our field | From the file | How |
| --- | --- | --- |
| Spend | Amount spent (GBP) | Sum. Match the column by its start, "Amount spent (", because the currency in brackets changes per client |
| Impressions | Impressions | Sum |
| Link clicks | Link clicks | Sum |
| Leads | Leads, plus any custom conversion columns the client maps as leads | Sum. See custom conversions below |
| Purchases, revenue from ads | Purchases, Purchase conversion value (if present) | Sum. Absent in Emily's file, so left for manual entry |
| Profile visits from ads | Instagram profile visits | Sum (optional extra field) |
| Reach | Reach | **Do not sum across campaigns**, same overlap problem as posts. Use the summary row if the export includes one, otherwise type it in |
| Campaign breakdown | Each row | Campaign name, spend, impressions, clicks, results, result type |

**Rules for this file**

- Skip rows where Amount spent is 0.
- **Never sum the Results column.** It means something different per campaign (in the sample: profile visits, a custom opt-in conversion, lead form leads). Read Result indicator to label each campaign's goal.
- **Custom conversions:** clients name their own conversion events, e.g. Emily's "Reset September Opt In" column. On first upload, any unrecognised conversion column is listed and the client ticks which ones count as leads or purchases. That choice is saved for their future uploads.
- Worked check against the sample: spend £536.84, impressions 55,461, link clicks 3,843, leads 99 (58 lead form + 41 opt-in conversions).

**Cost per lead must only use lead campaigns' spend.** In the sample, £124.65 went on two profile-visit campaigns that were never meant to get leads. Blended over all spend, cost per lead is £5.42; over the three lead campaigns only (£412.19), it's £4.16. The Ads page shows cost per lead from lead-goal campaigns, with total spend shown separately.

### 10.3 HeyClients / GoHighLevel (sample received 29 Sept: "Sales & Emails" PDF dashboard)

The sample is a PDF of charts, not a data file, so it can't be uploaded. Figures show as rounded numbers ("3.49K") or only as bars on a chart. HeyClients email is **manual entry** until a CSV export is found.

What the dashboard does show, as a guide for clients typing numbers in: total emails sent, total unsubscribed, opened emails by week, clicked emails by day, revenue and MRR. It does not show list size, new subscribers, or open and click rates as percentages.

**Change to Email fields (5.4):** because HeyClients reports counts rather than rates, the Email entry page accepts either:

- open rate % and click rate %, **or**
- total opens and total clicks, from which the rates are worked out (opens ÷ emails sent, clicks ÷ emails sent).

**Date range:** the dashboard defaults to a rolling 30 days (Aug 31 to Sep 29 in the sample). The help text tells clients to set it to the 1st to the last day of the report month.

Revenue and MRR figures from this dashboard are never imported. They're typed into Offers by the client, in line with the no-payments-data rule.

## 11. Build stages

Ship one audience working end to end before the next: retainer clients first, because Elize can test on real data before any member sees it.

1. **Foundations.** All `report_` tables with row-level security, the metric list seeded from section 5, roles and access, and the shared formula module with its unit tests. *Done when:* every formula in this brief passes its test.
2. **Core report for retainer clients.** Top tab navigation; entry pages for Social Media, Email, Leads & Conversions, Offers and Financials; the Overview report; Draft and Published states; strategist notes. *Done when:* Elize has entered two past months for one real retainer client and Nina has published a report from it.
3. **Remaining categories and the rules.** Funnels, Ads, Client Experience, Trial Reels; targets, benchmarks admin, traffic lights, "Look at these first". *Done when:* the Overview panel picks the right three metrics on test data.
4. **Launches module.** Setup, stages, emails, sales, pipeline, planner, compare. *Done when:* Nina's January launch tracker has been re-entered and matches its own totals.
5. **Self-serve.** aOS member access, reflections and objectives, first-time setup (offers, targets), Chiarezza access with an end date, hide-a-category, the members admin view and the two Piazza reminders (8.1). *Done when:* a test member can go from first login to a finished month without help.
6. **CSV import.** Meta content and Meta Ads exports only (10.1, 10.2). Email platforms are manual for now. *Done when:* a real Meta export fills the Social Media and Ads fields correctly.

## 12. Open decisions

All seven were resolved with Nina on 28 and 29 Sept. Kept here as a record of why.

- [ ] **Chiarezza timing.** Resolved: not an issue, the whole tool is being built in one go.
- [ ] **Trial Reels fields** (5.3). Resolved: monthly summary only, no per-reel log (see 5.3).
- [ ] **Who fills in Financials for self-serve members.** Resolved: members fill in everything, with two Piazza reminders (see 8.1)
- [ ] **Benchmark values** (section 7). Resolved: set per client for their niche, using a copy-and-paste AI prompt in first-time setup (section 7).
- [ ] **Sample CSV exports.** Resolved: upload for Meta content and Meta Ads only; HeyClients, ActiveCampaign, Kit and Flodesk are manual for now (section 10)
- [ ] **Satisfaction score.** Resolved: dropped; "Issues raised" added instead (5.8)
- [ ] **Launch attendance goal.** The mockup's planner card shows 600 sign-ups for 30 sales; the correct figure is 1,277 (6.6). Fix the mockup before anyone reuses it.

**Actions**

- [ ] Nina: send an ActiveCampaign export, and a HeyClients spreadsheet export if one exists, when available. Meta content, Meta Ads and the HeyClients dashboard PDF were received 29 Sept.
- [ ] Add a question to the client onboarding form: "Which platforms do you use for email, social, ads and payments?" so new CSV imports can be built from a client's first export.

## 13. Instructions for Claude Code

Read this whole brief before writing any code, then follow these rules.

**How to work**

1. Read the aOS codebase first, including `CLAUDE.md` and `docs/aOS_Current_State.md`. Reuse existing patterns for auth, roles, layout, notifications (the Piazza) and styling rather than inventing new ones.
2. Build one stage at a time (section 11). Start each stage with a short written plan and wait for Nina's approval.
3. Show every database migration's SQL to Nina before running it. She reviews it and runs verification queries in the Supabase SQL Editor.
4. Don't commit or push client-facing changes until Nina confirms testing is done.
5. The five mockup images in `docs/reporting/mockups/` are the visual reference (Overview, Social Media entry, Launches, Social Media report, Offers). The first two show a left sidebar: ignore it and use the top tab row (section 3). The Launches mockup's planner number is wrong: follow the formula in 6.6.

**Hard rules**

- No AI or LLM calls anywhere. No Anthropic or OpenAI keys, no API routes to them. The benchmark prompt (section 7) is plain text the client copies out.
- All money figures are ex-VAT (net). VAT never appears in any figure.
- Client users must never see a client switcher, admin areas or any sign other clients exist. Remove these from the page entirely, never hide with CSS.
- Security is enforced in both row-level security and code, never RLS alone. Check every `report_` table for the column-ownership trap: row access grants every column, so team-only columns (e.g. draft strategist notes) belong in separate tables.
- Draft reports and unpublished notes must be unreadable to the client at database level.
- Watch the Supabase 1,000-row limit on reads. Page through or aggregate in SQL so year views never silently undercount.
- Every clickable card, tab and button has exactly one route.
- Define shared helpers once and reuse them. Never guess a function or column name: check it exists.

**Testing**

- Every formula in section 5 and 6 gets a unit test, using the worked examples in this brief (the Emily ads totals in 10.2, the launch planner check in 6.6).
- Prove each test can fail by breaking the thing it protects, then restore it.
- Test divide-by-zero on every rate (shows a dash, not an error or 0%).
- After changes across several files, re-read the whole feature end to end rather than trusting each patch.
