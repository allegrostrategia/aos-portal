# Stage 4 — the Launches module

Plan for approval · 8 October 2026 · not started

**Nothing here is built yet.** Stage 4 is the last large piece of the reporting tool, and the one with the most already underneath it: every table and every calculation exists and is tested. What is missing is the whole of the visible half.

Order is unchanged — Stage 4, then 5 (aOS members), then 6 (Meta CSV). No aOS member joins until all three are done, and Nina reviews once, at the end.

---

## What it does, from Nina's side

A launch is its own record with its own dates and its own page. It is **not tied to a month** — a launch that runs across October and November is one launch, not two.

She opens Launches and sees a card per launch: status, total revenue, sales against goal, a progress ring. Opening one gives her the stage timeline, the goal bar, the KPI cards, the attendance funnel, the email open-rate chart, sales by source, and the planner. Three buttons: **+ New launch**, **Compare launches**, **Edit launch details**.

**The planner is the part that is hers rather than the client's.** It works backwards from a sales goal:

> 30 sales at 5% conversion needs **600 live attendees**; at 47% show-up that is **1,277 sign-ups**.

Always rounding up, at both steps. For a first launch she types the two rates; for a later one it offers the client's real rates from a previous launch. §6.6 of the brief notes that the approved mockup shows 600 sign-ups and is **wrong** — the formula is right and the code already follows it.

## What is already built

More than it looks. All of this is done, tested and on live:

- **Four tables** — `report_launches`, `report_launch_stages`, `report_launch_prices`, `report_launch_values` — with full access rules, a guard that stops a team member publishing a launch, and a guard on which figure can sit in which context.
- **46 launch figures** in the metric list.
- **Every calculation in §6**, unit-tested: show-up rate, day-by-day drop-off, pitch retention, % of sign-up goal, total sales, total revenue, revenue still to collect, average order value, % of each goal, conversion rate, reply rate, call-to-close rate, cost per sign-up, cost per sale, ROAS, the per-stage email averages, the sales-by-source reconciliation, and the planner itself.

So Stage 4 is not a build from nothing. It is screens over arithmetic that already works.

## What is left

Entirely the visible half:

1. **Routes.** `/reporting/launches` (the list), `/reporting/launches/[id]` (one launch), `/reporting/launches/compare`. None exist; the category is gated at stage 4, so the paths do not resolve today.
2. **Setup screens** — new launch, its stages in order, its price options, its three goals.
3. **Entry screens** — per stage: sign-ups, attendees per live day, replay watchers, the pitch figures; per stage: the email rows; then sales, pipeline and ads.
4. **The launch report** — the card grid, the stage timeline, the goal bar, the attendance funnel, the email open-rate line chart (a colour per stage), sales by source, and the planner panel.
5. **Compare launches** — any two, side by side, with up and down arrows.
6. **The monthly Launches tab.** The category exists with no entry screen of its own; see decision 7.

## Migrations

**One, and only one: a storage bucket for launch cover images.**

`report_launches.cover_image_path` exists; nothing writes it and there is nowhere for the file to go. Every other bucket in this project was made in the dashboard, which the standing rule says not to repeat: *anything that has to be done in a dashboard is a step that can silently not happen.* So the bucket goes in a migration, guarded so it also runs in the local harness, with its access rules beside it and an assertion in the schema test.

Nothing else. The four tables, the figures and the guards are already on live and cover §6.1 to §6.5 as written. If a screen turns out to need a column, that is a second migration shown separately — not a reason to widen this one now.

## How it is tested

The same three layers as Stage 3, for the same reasons:

- **Harness (`npm run test:db`)** — the actions driven as the real people against real access rules: Nina, an assigned team member, and the client. Publishing a launch, and the team member being refused. Every figure that hangs off a stage, a price or a day landing in the right place.
- **Unit** — the calculations are already covered; what is new is the screen-level assembly, which gets the same treatment.
- **Browser (Playwright, both widths)** — because the last three stages each had a bug invisible to every other layer: two pages that rendered nothing, a card disagreeing with its own report, and figures that held while their labels vanished. A launch page is the most assembled screen in the product, so it gets the most of this.
- **Mutation testing on anything that guards or refuses**, one mutation at a time.

Nothing is applied to live without the SQL being shown first, and the whole stage stays behind the stage flag until it is finished.

---

## Decisions that are Nina's — my recommendation for each

Dom to approve these for now; they go on the running list in the state doc for her final review.

**1. Default show-up and conversion rates for a first launch.**
*Recommend 47% show-up and 5% conversion* — the numbers in her own worked example in the brief, so the planner's first answer matches the one she has already sanity-checked. Editable, as §6.6 requires.

**2. How a launch's status is set.**
*Recommend she sets it by hand* — Planning, Live now, Completed — with nothing changing it automatically. Dates slip, and a launch being finished is a judgement about whether the cart is really shut, not a fact about a calendar.

**3. Does publishing a launch email the client?**
Publishing a month does. *Recommend a launch does not.* The page becomes visible and the next monthly report is where it is mentioned. One email a month rather than two, which is the same instinct as everything else that protects her time and the client's attention.

**4. Who can use "Compare launches"?**
*Recommend the team only.* Showing a client this launch against their better one is a conversation Nina should choose to have, not a page they can find on their own.

**5. Is the cover image required?**
*Recommend optional.* A launch mid-flight should not be blocked on finding a picture, and the card reads perfectly well without one.

**6. Sales by source that does not add up to total sales.**
The brief says the form warns. *Recommend keeping that, not refusing* — a real launch has sales nobody can attribute, and forcing the numbers to reconcile would mean inventing an attribution.

**7. What the monthly Launches tab shows, given launches are not monthly.**
*Recommend: the launches whose live dates fall in that month, as cards linking through to the launch page* — so a month's report says a launch happened without duplicating its figures, and the launch stays the one record §6 asks for.
