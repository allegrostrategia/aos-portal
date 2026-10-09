# Stage 5 — aOS members fill in their own report

Plan for approval · 9 October 2026 · not started

**Nothing here is built yet.** Stage 4 is complete and switched off; this is the second of the three stages between here and Nina's single review.

Order is unchanged — Stage 5, then Stage 6 (Meta CSV). No aOS member joins until both are done.

The brief's own definition of finished, §11.5: *"a test member can go from first login to a finished month without help."* That sentence is the whole specification, and every item below is something that sentence currently runs into.

---

## What it does, from a member's side

A retainer client is reported *to*. An aOS member reports on **themselves**: they fill in every category, Financials included, and Allegro enters nothing. Nina never touches their figures — which is the point, and also what makes this stage mostly about the parts of the product that assume somebody at Allegro is driving.

A member opens Reporting from their own navigation, sees last month waiting, fills in the categories that apply to them, hides the ones that do not, writes a reflection, sets next month's objectives, and is nudged twice if they forget.

## What is already built

More than it looks, again — but for a different reason than Stage 4. Stage 4 had the arithmetic and no screens. Stage 5 has **screens that already work for any kind of workspace**, and no way for a member to reach them.

- **The access rules are finished and tested.** `canEdit` lets a self-serve client edit their own figures (`role === "client" && kind !== "retainer"`); `canPublish` is Nina's alone; `report_can_view` consults `has_portal_access()` for `aos_member` workspaces, so cancelling revokes reporting with the rest of the membership — rule 7, already closed.
- **The lock and the freeze do not apply**, deliberately. `report_month_is_locked` is `kind = 'retainer'` only, because a self-serve member is their own editor and an unscoped lock would be a trap. Nothing to change.
- **Every entry screen and every report screen already works**, whoever the workspace belongs to. None of them is retainer-specific.
- **`hidden_categories` exists and is honoured on read** — the Overview, the KPI grid, the tab row and the targets screen all filter on it. Nothing can set it.
- **`report_reminders` exists** (workspace, month, which of the two, sent at), so duplicates are already impossible. Nothing writes to it.
- **The setup answers exist as columns**: `benchmark_business_description`, `benchmark_main_offers`, `benchmark_country`, `target_hourly_rate`.
- **The `reflection` note type is in the enum** and the note action already knows a member files one rather than a strategist note.
- **Nina can create an aOS member workspace today** in `/admin/reporting`.

## What is left

Eight things. Six are screens; one is a cron job; one is a definition.

1. **A way in.** The member navigation is six items — Piazza, The Map, La Strada, Sociale, Log, You — and none of them is Reporting. A member with a workspace cannot find it. Smallest honest fix: an entry on **You**, plus a card on Piazza during the window when last month is unfinished. *Not a seventh nav item* — the six are settled and a seventh would cost every other screen's balance for something used once a month.
2. **First-time setup.** The columns exist; the guided first run does not. Business description, main offers, country, target hourly rate, their offers, and their first targets — asked once, in order, on first arrival, and editable afterwards.
3. **Hide a category.** One screen, writing `hidden_categories`. Everything downstream already reads it.
4. **Completion, and the orange markers.** "Done" means every visible category has its **core fields** filled. *There is no definition of "core field" anywhere in the code today* — this is the one piece of Stage 5 that may need a migration (a flag on `report_metrics`), and it has to exist before the markers or the reminders can mean anything.
5. **The two Piazza reminders** (§8.1). 1st of the month: "Time to fill in your report for \[last month\]." 8th, only if it is not done: "Don't forget…". No others, ever. A cron job, guarded on `report_reminders`, writing a Piazza notification — and **the service role writes it, so every guard in its path must admit a null `auth.uid()`**, the trap that cost three weeks on the pairing flag.
6. **The member's reflection and objectives.** The note type is there; the screen is not. The reflection is theirs, not Nina's, and follows the Friday-reflection principle: it is the member's own record, not something that feeds a shared room.
7. **The admin members view** — Nina sees each member's report status for the month and which categories they have hidden, so she can raise it. Read-only; she still enters nothing.
8. **Chiarezza.** Same self-serve shape with an end date. The admin side exists; what a Chiarezza login sees on the day access ends has never been walked through.

## Migrations

**Probably one, possibly none.** Everything Stage 5 reads already exists. The open question is item 4: if "core fields" is a property of a metric, it is a boolean on `report_metrics` and a regenerated seed. If it can be derived from what is already there (`input_type`, `good_direction`), it is no migration at all.

That is the first thing to settle once this plan is approved, because the markers, the completion count, the reminders and the admin view all depend on it. SQL shown before anything is applied, as always.

## How it is tested

The same three layers, and one addition.

- **Harness** — a member driving their own figures through the real actions, and the things they must *not* reach: another member's workspace, publishing, a strategist note. Plus the reminder job run as the **service role**, which is where a guard that admits only `is_portal_admin()` would silently refuse it.
- **Unit** — completion, which is pure: given a set of hidden categories and a set of filled fields, is the month done.
- **Browser, both widths** — the brief's own test: first login to a finished month without help, as one walkthrough. That is the single most valuable test in this stage and it should be written first.
- **The census** (`npm run test:census`) runs with the rest, so nothing disappears quietly.

Behind the stage flag throughout. Nina's review is still once, at the end of Stage 6.

---

## Decisions that are Nina's — my recommendation for each

Dom to approve for now; they go on the running list in the state doc.

**1. Where a member finds Reporting.**
*Recommend an entry on **You**, plus a Piazza card while last month is unfinished.* The six-item navigation is settled and this is a once-a-month task; a seventh item would be the most prominent thing on every screen for the twenty-eight days nobody needs it. The Piazza card is what makes it findable at the moment it matters.

**2. What counts as a "core field".**
*Recommend the fields a category cannot be read without* — for Financials, revenue and the three cost lines; for Leads & Conversions, new leads and new clients. Not every box: a member who fills in eleven of twelve and stays orange forever will stop trusting the marker.

**3. Whether a member can hide Financials.**
*Recommend yes.* §8.1 says "any category", and a member who will not put their revenue in is better served by an honest gap than by a permanently unfinished report. It costs the Overview its money panel for that member, which is their choice to make.

**4. What the reminders are, exactly.**
The brief gives both sentences. *Recommend using them verbatim* — they are already in her voice — and sending **nothing else, ever**, which the brief is explicit about.

**5. Whether Nina is told when a member has not finished.**
*Recommend the admin view only, with no notification to her.* She can look when she wants to. A notification per unfinished member per month is the sort of thing that protects nobody's time.

**6. What a member sees after their first month, before the second exists.**
*Recommend the finished month, with next month appearing on the 1st.* The alternative — an empty shell for a month that has not happened — is the thing §4's dash rule exists to prevent.

**7. What a Chiarezza login sees when access ends.**
*Recommend the same answer as a cancelled member: access is revoked, every record is kept, and the screen says so plainly rather than 404ing.* Rule 7, applied to a workspace kind that has an end date built in.
