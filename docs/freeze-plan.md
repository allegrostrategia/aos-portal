# Freezing carried figures at publish

Plan for approval · 7 October 2026 · aOS reporting tool

A published report should not change because an earlier month was edited. Today it does: taking July back to draft empties part of a client's published August, with no notice to anyone. This plan stores a month's carried figures on that month when it is published, so the report a client was sent stays the report they read.

> **Status, 7 October — BUILT AND LIVE.** All four decisions were approved
> and the whole of this plan is applied: `report_periods.carried`, written
> at publish with the service role, read in preference to the live walk on
> a published month. Backfilled over Test Client's two published months,
> and every Stage 2 tab diffed as the client before and after — no figure
> and no comparison label changed.
>
> Two things this document did not anticipate, both now in:
> **`carried.previousMonth`** (freezing the figures was not enough — the
> card also has to say what they are compared against), and the **`{}`
> fallback**, so a month the backfill misses works out its figures live
> rather than going blank.
>
> Kept as the record of why, not as work outstanding.

---

## Why

A retainer client's figures are computed from the months **they** can read, and they can only read published ones. Two reads cross a month boundary: `getMonthData` loads the previous month for every "vs. last month" comparison, and `getClientFlow` walks the whole history for the opening-figure chain. Both go through the member-facing Supabase client, so RLS applies.

Measured on 7 October against the local stack. Northwind Studio's August stayed published throughout; only July changed.

| What the client's August report says | July published | July back to draft |
| --- | --- | --- |
| Active clients at start | 22 | *row gone* |
| Active clients at end | **25** | **3** |
| Retention rate | 90.9% | *row gone* |
| Churn rate | 9.1% | *row gone* |
| Month-on-month deltas | "↑ 14% vs. July" | "No month to compare" |

The row that mattered most was the second. Three figures disappear, which reads as missing. One **changed**, because "start + new − left" computed happily from a start it could not see — so a client opening their report mid-correction read that they ended August with 3 clients. A wrong number presented as fact, not a gap.

**That second row is fixed as of 7 October** — `activeClientsAtEnd` now returns a dash unless all three inputs are known. The other four rows are not: those figures still vanish while an earlier month is a draft, and that is what this plan is for.

This was always reachable. What changed on 7 October is that unpublishing became the ordinary way to fix a figure, which turns a corner into a path.

## What gets stored

The figures a month's report needs from **other** months, written onto that month when it is published.

There are exactly two kinds, and they are already the only two cross-month reads in the code:

1. **The opening-figure chain** — what `activeClientsAtStart` works out by walking July onwards: the opening figure, new clients and clients who left, for every month up to this one. Stored as the single number it resolves to, not the chain.
2. **The previous month's figures** — everything "vs. last month" compares against, which is the whole of the previous month's `report_values` for the metrics this month shows.

**Proposed: one new column on `report_periods`.**

```sql
alter table public.report_periods
  add column carried jsonb not null default '{}'::jsonb;
```

Shape: `{"self": {"<metric key>": <number>}, "previous": {"<metric key>": <number>}}` — the figures this month derives from earlier months, and the previous month's figures it compares against. Entity-keyed metrics (per offer, per campaign) use the same `metric_key|entity_id` form `ValueBag` already uses, so nothing new has to parse it.

**Why a column on `report_periods` rather than rows in `report_values`:**

- `report_values` is what somebody typed. A carried figure is derived, and mixing the two is how a derived number ends up looking like an entered one on an entry screen — and how it ends up editable.
- It is one row per month, written once, read once. A join that returns nothing extra.
- The published-month guard already covers `report_periods`' own columns through `guard_report_period_publish`, so the new column inherits a guard rather than needing one.
- Rule 7 holds: nothing is deleted, and republishing overwrites a snapshot of derived figures, never a record of what anyone entered.

## When it is written

In `publishMonth`, in the same server action that sets `published_at`, before the email goes.

Computed with the **service role**, not the publisher's session. That is the point: the snapshot has to be what the report truly contains, not what the person pressing Publish happens to be able to read. In practice Nina can read everything anyway, but writing it with her session would make the stored figures depend on who published, which is the bug in a different coat.

Republishing recomputes it. A correction is meant to change what the client sees — that is why republishing emails them — so the snapshot moves with it.

**Backfill.** Every already-published month needs one, or it reads as a month with nothing carried. One migration-time pass over published periods, service role, same computation. Today that is two months on one test workspace, so it is cheap now and gets dearer every month we wait.

## How reading changes

One rule: **on a published month, a carried figure comes from the snapshot. On a draft, it is computed live.**

That keeps the two audiences right without a second code path per screen. An editor working on a draft sees the figures move as they type, which is what a draft is for. A client reading a published month sees what was published, whatever is happening to the months around it.

It also means an editor looking at a published month sees exactly what the client sees — which is already true of every other figure, and is the honest answer for a report that has gone out.

The change lands in `getMonthFigures`, which is the one place that assembles a month: it already takes the period row, so it can prefer `period.carried` over the live walk when `published_at` is set. `getClientFlow` and the previous-month load stay as they are for drafts.

Afterwards, the measured table above reads the same both ways: July back to draft, August still says 22, 25, 90.9%, 9.1%.

## Entity settings, which the month-keyed lock cannot reach

An offer, campaign or funnel is a workspace-level row (`report_entities`), not a monthly one. Nothing about it belongs to a month, so no month-keyed guard can hold it still — and several of its columns feed figures on a published report. Dom named five on 7 October; each was checked against the code rather than assumed.

| Setting | Does it change a published report? | How to handle |
| --- | --- | --- |
| `campaign_goal` | **Yes, and it is the worst of them.** Cost per lead counts spend from lead-goal campaigns only — §10.2's worked case is £4.50 honest against £6.00 blended. Reclassify one campaign and the client's published cost per lead moves. | Freeze: store each campaign's goal in the snapshot and read it from there on a published month. |
| Funnel `linked_offer_id` | **No — already handled.** Funnel revenue is purchases × `funnels_offer_price_at_month`, a per-month value in `report_values` captured on first save, which the 7 October lock now protects. The offer's identity is never shown to the client; only the funnel's own name and figures. | Nothing. Said here so nobody re-solves it. |
| Offer and funnel `name` | **Yes.** The name is the row label on the client's report, so renaming "Starter package" rewrites a report they have read. Cosmetic in one sense; in another it is the only thing identifying which row is which. | Freeze the names in the snapshot, with the figures they label. |
| `active` (retire / put back) | **No.** Checked: `active` is used only by the entry screens' active-vs-retired grouping and by the editor-only "still to fill in" count. The report's own row builders do not filter on it. | Nothing, but write the test — this is one line away from becoming a hole, and nothing currently says it must not. |
| Deleting an entity | **Yes, and it broke rule 7.** Both `entity_id` foreign keys were `on delete cascade`, so deleting an offer deleted every figure ever recorded against it. | **Done, 7 October** — both are now `on delete restrict`. See decision 4. |

### What this adds to the snapshot

Alongside the carried figures: `{"entities": {"<entity id>": {"name": "…", "goal": "leads"}}}` — the labels and the one setting that changes a number. Not the whole row: price is already captured per month for funnels, and an offer's price and hourly cost feed figures that are themselves stored per month.

## The launch-checklist item this closes

> **A retainer client sees dashes for Client Experience figures when an earlier month in the chain is still a draft.** […] A dash is the safe answer and the one built; it is not obviously the *right* answer for a client joining mid-relationship. **Decide before a real client reads a mid-relationship month.**

(State doc, launch checklist, Dom, 6 October.)

The freeze answers it, and in doing so corrects it. **A dash was not what was built.** The measurement above shows "active clients at end" coming out as 3 rather than a dash, because the subtraction had no guard against an unreadable start — so the item understated what it described, and the "safe answer" it credited was not the one in the code. The strict `activeClientsAtEnd` has since made the dash real; the item's *premise* is now true, and its question is still open.

With a snapshot, the case the item worries about — a client joining mid-relationship, their first months never published — is answered properly rather than safely: whatever the report said when it was published is what they keep seeing. Nothing is derived from history they cannot read, because nothing is derived at read time at all.

The item should be rewritten when this ships, not ticked.

## What it does not cover

**Also closed, for free.** A standing target (`report_targets.month is null`) and a benchmark both move the bar on every published month and cannot be locked by a month-keyed guard — the known hole in the 7 October lock migration. If the snapshot stores the target and benchmark a month was published against, that hole closes with it. Worth folding in; it is a few more keys in the same column.

**Not covered.** Charts drawn from a trend across months, and the Trial Reels "Proven" marker, both read history on purpose. Freezing those would mean freezing a chart's whole series onto every month, which is a different and much larger thing. A client's trend chart will still change if an earlier month is unpublished. Flagging rather than solving.

## Four decisions before anyone builds this

### 1. One column, or a table?

The plan proposes `report_periods.carried jsonb`. The alternative is a `report_carried_values` table — one row per metric per month — which is queryable, typed, and joins like everything else.

*For the column:* it is written once and read once, always whole, and never queried across months. A table would be several hundred rows a year carrying no question anybody asks. It also inherits `report_periods`' existing publish guard instead of needing RLS and a guard of its own.

*Against it:* jsonb is unvalidated, so a shape change is silent, and nothing stops a stale key sitting there forever.

**Recommendation: the column.** The thing being stored is one opaque blob per month, which is what jsonb is for. The validation worry is answered by a test that publishes a month and asserts the snapshot's shape, which is cheaper than a table.

### 2. Does the snapshot include targets and benchmarks?

*Yes:* it closes the standing-target hole left open by the 7 October lock, and the benchmark hole beside it — both currently move the bar on every published month and neither can be reached by a month-keyed guard. Same mechanism, a few more keys, no extra migration.

*No:* targets and benchmarks are arguably *about* the business rather than *in* the report, so a client seeing an updated target could be called correct rather than wrong.

**Recommendation: yes.** The panel says "New clients is at 40% of your target" in the client's own report. That is a sentence in the report, and it should not change after it is sent.

### 3. On a published month, does an editor see the snapshot or the live figures?

*The snapshot:* Nina and the client see the same report, which is §9's rule, and the one screen she would use to check what the client is looking at actually shows it.

*Live figures:* she sees the truth as it stands now, which is arguably more useful while correcting — but it means her screen and the client's disagree on a published month, with nothing on either saying so.

**Recommendation: the snapshot**, and I do not think this is close. The live view she wants during a correction is the draft view, which she gets by unpublishing — which is now the route anyway.

### 4. What happens when an entity is deleted? — **decided and done, 7 October**

Not in the original plan; it came out of the entity review above. `report_values.entity_id` and `report_targets.entity_id` both cascaded, so deleting an offer deleted its figures from every month including published ones — against rule 7, and not something a snapshot fixes, since the record behind the report would be gone.

**Recommendation was: change both to `on delete restrict`** and leave "retire" as the only way to take an entity off the screens. Approved by Dom and applied to live the same day (`20261007130000`), with `deleteEntityMessage` ready for the day a delete button exists.

## Size

One migration (the snapshot column), one new write in `publishMonth`, one branch in `getMonthFigures`, a backfill pass, and tests. The unpublish warning built on 7 October stays until this ships, and can come out afterwards.
