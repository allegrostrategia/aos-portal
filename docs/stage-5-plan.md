# Stage 5 — aOS members fill in their own report

**Approved by Dom, 9 October 2026**, with the seven recommendations going to Nina's list and seven additions folded in below.

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
3. **Hide a category.** One screen, writing `hidden_categories`. Everything downstream already reads it. **Display-only** (Dom, 9 Oct): nothing is deleted, un-hiding restores everything exactly as it was, and a figure pulled into another section keeps working while its own section is hidden. The last one needs a test — `PULLED_FROM` maps Offers' revenue into Financials, so hiding Offers must not blank a Financials figure.
4. **Completion, and the orange markers.** "Done" means every visible category has its **core fields** filled. **No migration: the marker already exists and is already explicit.** `report_metrics.input_type` is one of `core | optional | calc | pulled`, seeded from §5 of the brief, which is the same distinction §8.1 means — the brief's own data-model table says `report_metrics` holds "core or optional". Adding a second boolean beside it would be two markers that can disagree. The counts are sane: Financials 4 core of 6, Leads & Conversions 6 of 7, Funnels 3 of 8, Social Media 7 of 14.

   **Two things that list makes obvious, and both change what "done" means:**
   - Four categories are **per entity** — Social Media per platform, Funnels per funnel, Ads per campaign, Offers per offer. A member with no funnels has nothing to fill, so Funnels must count as **done**, not as permanently orange. Completion is "every core field of every entity they have", and no entities means nothing owed.
   - **"Clients at the start, when you joined" is asked once, not monthly.** `computeCarried` reads it across every month `<= this one` and carries it forward. Requiring it each month would keep Client Experience orange forever.
5. **The two Piazza reminders** (§8.1). 1st of the month: "Time to fill in your report for \[last month\]." 8th, only if it is not done: "Don't forget…". No others, ever. A cron job, guarded on `report_reminders`, writing a **private** notification to that member — never a post in the shared feed.

   **The service role writes it, so every guard in its path must admit a null `auth.uid()`** — the trap that cost three weeks on the pairing flag.

   **Nobody who has left gets one** (Dom, 9 Oct): not a cancelled member (`has_portal_access()`), not a Chiarezza login past its `access_end_date`. And **the 1st and the 8th are UK time** — a job fired at midnight UTC sends on the 31st during British Summer Time. All three exclusions get a harness test, run as the service role.
6. **The member's reflection and objectives.** The note type is there; the screen is not. The reflection is theirs, not Nina's, and follows the Friday-reflection principle: it is the member's own record, not something that feeds a shared room.
7. **The admin members view** — Nina sees each member's report status for the month and which categories they have hidden, so she can raise it. Read-only; she still enters nothing.
8. **Chiarezza.** Same self-serve shape with an end date. The admin side exists; what a Chiarezza login sees on the day access ends has never been walked through.
9. **The retainer-only parts must not render on a self-serve workspace** (Dom, 9 Oct). The publish card, the client reply box, "isn't ready yet", and the strategist note all assume somebody at Allegro is on the other side. On a member's own report there is no other side. A browser test signs in as a member and asserts each of the four is absent.
10. **A member's workspace is created with them**, so nobody arrives at "no access" — see the note below for what that touches.

## Migrations

**One, and it is not the one expected.** Core fields need none — `report_metrics.input_type` already carries the distinction explicitly.

What does need one is **item 10**, and it is small:

`report_workspaces` has **no unique constraint at all beyond its primary key**, so nothing stops a member ending up with two workspaces. That is survivable while Nina creates them by hand one at a time; it is not survivable once creation is automatic, because rule 7 says a rejoining member is the same row going through onboarding again — and a second pass would quietly make a second workspace, splitting their history in two.

So: a unique index on the owner for `aos_member` workspaces, and the creation made idempotent. SQL shown before it is applied.

### What automatic creation touches

- **`inviteMember`** (`src/lib/admin/members.ts`) — the obvious place, and the wrong one. It already rolls back the auth user if `create_member` fails; adding a third step means deciding what to undo when the third one fails. Better as part of `create_member` itself, or a trigger beside it, so a member and their workspace arrive together or not at all.
- **`create_report_workspace` checks `is_portal_admin()`**, which is true for Nina's session and false for the service role. If it is ever called from a trigger on a service-role write, it needs the `or (select auth.uid()) is null` arm — the same trap as everywhere else.
- **`members` has no business name.** Only `full_name`. So the workspace starts named after the person, and first-time setup is what corrects it. That is a consequence worth saying out loud: for a little while Nina's reporting list will show real names rather than business names.
- **Reactivation must not create a second one** — the unique index above, plus an existence check.
- **A backfill** for members who already exist.
- **Nina's `/admin/reporting` list will fill up with every member**, where today it holds the handful of workspaces she made by hand. It needs the member ones separated or filtered, or it stops being useful the day this ships.
- **Retainer and Chiarezza logins have no `members` row at all**, so none of this touches them.

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
