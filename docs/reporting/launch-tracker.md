# Launches, brought in line with Nina's launch tracker

**Nina's final spec, 19 November 2026**, after the gap list of the 18th.
Her framing is at the end of it and it decided the shape of the build:

> Update the demo with a completed and a live launch using all of this.
> Add launch detail pages to the PDF and the screenshots. Keep the
> migrations to the minimum. **Nina sees this as one more reporting
> view, not a large project.**

So: one migration, `20261119100000_the_launch_tracker.sql`. Four
columns, one enum, two tables, two context columns, eleven metrics.
Everything else is code.

**Dom reviewed it on the 19th and changed one thing**, which is written
up under item 9: the email figures are keyed by the email's row rather
than by the number a person types beside it.

---

## Her ten items, and where each one landed

### 0. Fix the demo first; show the ads and the DM pipeline

Both were real and neither was visible from any screen.

**The demo's launch figures never reached the launch page.** Every one
of the 38 values on each demo launch was written at launch level — no
`stage_id`, no `price_id`, no `day_number` — while the page reads
sign-ups per stage, attendance per stage per day, emails per stage per
number and sales per price option. The demo launch page therefore had no
funnel, no email chart, no price-option sales, and **four dashes where
its headline figures belong**, because total sales is the sum of sales
per price option. It had been that way since the demo was built, and
nobody had seen it: the screenshot sweep photographs the launches LIST.

**Nine boxes were enterable and appeared nowhere.** Ad spend, ad leads
and ad sales, plus DMs sent, replies, discovery calls, calls booked,
calls closed and not interested — in the entry form since 30 September,
on the launch report never, and on the team's Compare screen only as
cost per sale and ROAS. Both are panels now.

### 1. Launch type ticks that set stage names and labels

**No new column.** Her seven ticks — challenge, masterclass, webinar,
workshop, waitlist, open cart, other — are `report_launch_stage_type`,
value for value, since 30 September. A second list at launch level would
be the same list twice with no way to stop the two disagreeing.

What was missing is that the type **set** nothing. `stage-labels.ts` is
that half: the type names the stage (as a placeholder, never written
over what somebody typed) and labels its count, so a challenge asks for
"Challenge sign-ups" and the report and the entry screen cannot word the
same figure differently.

Two of the seven get a plain "Sign-ups": **nobody signs up to an open
cart** — it is the selling window — and "other" has nothing to borrow a
word from.

### 2. Key dates per stage, with the count for that stage

Already there: `promo_start/end`, `live_start/end`, `live_days`, and one
sign-up count per stage. What changed is the label on the count.

### 3. Pricing: pay in full, or monthly × a number of months

One column, `plan`. An instalment plan and a monthly membership have the
same three numbers — a contract value, a count, an amount — and
different MRR, and nothing stored said which.

`price` stays the full contract value either way; for a monthly option
it is worked out on save as amount × months, so total revenue needs no
special case and the stored value cannot disagree with the two numbers
it came from. **MRR counts the monthly options at one month each** — not
the contract value spread out, and not a share of total revenue.

### 4. Good / Better / Best on sign-ups as well as sales

Three columns (`sign_up_goal_good/better/best`) and one component,
`<GoalProgress>`, used twice. Now, the goal, **what is left to go**, the
percentage, and "Goal hit!".

"Left to go" is the figure the old panel was missing and the one
somebody acts on: 135% of good is a fact; "6 more for better" is a thing
to do this afternoon.

**A launch's sign-ups are never its stages added up.** They are
sequential — the people at the masterclass had already joined the
challenge — so the figure is the day-by-day total where the client has
typed days, and otherwise the first stage's.

### 5. The planner, and a check against it

No new column: the two assumed rates have been on the launch since
30 September. Three changes:

- **Allegro's defaults** (47% show-up, 5% conversion) fill a new
  launch's boxes, beaten by this client's own conversion from their last
  finished launch where there is one.
- **The client sees it**, where it was the team's panel. A plan nobody
  can see is not one anybody is held to. Changing the rates is still an
  editor's job.
- **The check**: actual against assumed, on track or behind, with a
  tolerance of a tenth of a point so a badge does not flip on the third
  decimal place. A launch with no assumption, or nothing to measure, gets
  neither word.

The show-up step is absent where the launch has no live event — a
waitlist and an open cart have no room for anybody to turn up to.

### 6. A sources builder, with a target each

`report_launch_sources`: the client's own names, a position, a sign-up
target. Figures hang off it through a new `source_id` context on
`report_launch_values`, with two metrics —
`launches_sign_ups_from_source` and `launches_sales_from_source`.

**The six old metrics are superseded and kept.** `launches_sales_from_stage`
and its five siblings made the list ours rather than theirs, could not
carry a target and counted sales only. The migration creates a source for
each one a launch had a figure for and **copies** the figure across;
nothing is deleted and nothing reads them now.

A source's share is **of what was placed against a source**, not of the
launch — otherwise a launch with 400 sign-ups and 300 placed shows four
shares adding to 75%, which reads as arithmetic going wrong.

### 7. Sign-ups by day, and a link to their own lead tracker

`launches_sign_ups` with a `day_number` and no stage, over the launch's
own span — first date any stage carries to the last, the same pair the
lock and the date range on the card read. Shown as a **running total**,
because the question a launch asks every morning is "how many now".

`lead_tracker_url` is a link and only a link: the column is constrained
to `http(s)` in the database, because it is rendered as an anchor on a
page a client opens.

**No names, emails or handles.** The list stays in their Drive; aOS
holds the link and the counts. That was already the rule — the header of
`20260930127000_report_launches.sql` says "numbers only" — and nothing
here changes it.

### 8. Ads, including the Meta export

The Ads section's own reader, `readMetaAds`, unchanged but for one line:
it takes `null` for the month. A launch is its own date range and crosses
months often enough that refusing a file for "the wrong month" would
refuse most real launch exports.

Three of the export's seven figures cross over — spend, link clicks and
sign-ups — renamed on the way in, so the list a person checks is in the
launch's words rather than the file's.

Budget, target cost per sign-up and link clicks are new metrics; what is
left, cost per click and the sign-ups the budget was meant to buy are
worked out. **Cost per sign-up is against the ads' own sign-ups**, not
the launch's, which would flatter the ads by however well the email list
did.

### 9. A row per email

`report_launch_emails`: the stage, the number, the date, the subject,
and whether it was a resend. The four rates stay in
`report_launch_values`; `launches_email_clicked_no_sign_up` is new.

**The figures point at the row, not at the number** — `email_id`, added
on Dom's review of the migration, 19 November. The first cut kept the
figures under their old `(stage, number)` key, on the reasoning that
nothing had to move. What that cost: the number is the client's label
and they edit it, so renumbering email 3 to 4, or removing email 2 from
the middle of a sequence, either stranded an open rate against a number
nothing described or landed it on the email below. `email_number` is
retired empty — held that way by a check constraint rather than dropped,
because a dropped column cannot come back on live — and the existing
figures were carried onto their rows by the migration, creating a row
for any email that had figures and no description.

The screens still address an email as "stage 2, email 3", because that
is what a person can see and a blank row has no id yet. The translation
happens in two places and only two: `LaunchValues` takes the email rows
and keys by number on the way out, and `saveEmailRows` hands the figure
loop a `(stage, number) → id` map on the way in.

**An email's figures cascade from its row**, where a stage's, a price
option's and a source's all restrict. The difference is what the row is:
an open rate is a property of the email, not a figure filed under it, so
removing the row is how it goes. A source is a label on sign-ups that
happened whatever you later call them, which is why removing one with
figures on it is refused out loud instead.

**A row exists when anything about that email does**, figures included —
otherwise an email somebody recorded an open rate for and no subject for
would be missing from the table, which is built from the rows. Since the
19th it is also what the figure has to point at, so a figure typed for an
email nobody has described makes the row as it saves, empty, rather than
being dropped for having nowhere to go.

**Two charts, never one.** An open rate runs around 40% and a click rate
around 4%; on one pair of axes the click line is a smudge along the
bottom, and a second y-axis is the chart mistake this project does not
make.

### 10. Not included

A year view for launches — a launch has no month, and nothing here gives
it one. And any lead names, emails or handles.

---

## Two judgements flagged for Nina

1. **The lead-tracker link is not held by the published lock**, where
   the three new sign-up goals are. A goal is a figure on the report; the
   link points somewhere else, and a client whose sheet has moved should
   not need an unpublish to fix a button.
2. **The planner is the client's now**, which reverses the reasoning
   that it was the team's. Her item 5 asked for the check, and the check
   is what makes the plan worth showing.
