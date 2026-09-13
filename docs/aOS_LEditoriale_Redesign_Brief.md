# aOS — L'Editoriale Redesign Brief

## The direction, in one line

Right now aOS is functional but reads as a database — clean, but not *designed*. The reference (aOS "L'Editoriale" — the full 14-screen poster Nina supplied) is the target: an editorial, magazine-like feel — large serif display type, numbered list rows, softly rounded cards with a translucent/glass treatment, warm full-bleed imagery, gentle pill-shaped buttons. Same brand palette throughout (navy, orange, gold, sky), just a fuller, more considered expression of it.

**Before any of this starts: fix mobile performance first, on its own.** Even the Piazza hero is currently slow to load on mobile. Investigate image sizing/optimisation, whether `next/image` is being used properly across station images, the map, and the milestone path artwork, and any avoidable JS weight on first load. This is urgent and independent of the redesign — do not let new visual weight (translucent blur effects especially) land on top of an unresolved performance problem. `backdrop-filter: blur`, used throughout the reference's card style, is expensive on mobile Safari specifically — treat every use of it as something to test on a real phone before it ships, not something to add wholesale.

**This redesign is a design-system update, not eleven separate reskins.** Update shared tokens and base components first (type scale, card treatment, button style) so the change propagates everywhere at once, the same way the original fluid type scale and component library worked. `CLAUDE.md`'s standing brand rules (Inter for body text, navy buttons, the current card treatment) need rewriting once this direction is confirmed, the same way the AI-drafting rule was rewritten — otherwise a future session drifts back toward the old look.

Everything below is organised by screen. Each says plainly whether it's a **reskin** (visual only, no new backend work) or **new scope** (needs new data, new tables, or new logic).

---

## 1. Navigation & station access

**Bottom nav — 5 items, deliberately not all 8.** Piazza, La Strada, Sociale (chat), Roadmap+Log (combined), Settings/Profile. Eight was tried and rejected as too cramped on a real phone.

- **Hot seat, Milestones, and Pairing all lost their own nav slot** — each needs a card on Piazza instead, with a genuine, unconditional route in (not just implied by being on the dashboard). This matches the lesson already learned once this build: a screen with no reliable way in is effectively invisible, however good it looks once you're there.
- **Library (the flat, browsable training list)** doesn't get its own nav slot either — it lives as a link/toggle on the La Strada screen itself.

**La Strada** — opens to the actual map by default (that's the thing worth showing off). A small burger-menu icon toggles to a flat list view of all eleven stations (reference screen "04 All Stations" — icon, name, category, in the reference's numbered-row editorial-list style). Both views reachable from the same screen.

*Reskin* — the map and its mechanics (drag-to-pan, zoom, land-mask positioning) are already built and tested; this only restyles the surrounding chrome and adds the list-view toggle.

---

## 2. Training station page + individual lesson

**Station page** (reference: "05 La Boutique"):
- Photo banner (existing)
- Station description, styled prominently as a short editorial quote/summary — reusing the existing description field, just given real visual weight
- Three sections: **Lessons** (existing training content, just renamed), **Tools** (existing PDFs/spreadsheets/templates — renamed from "Resources"), **Hot seat replays & audio** (kept as its own small section, separate from Lessons)

**Individual lesson page** (reference: "06 Lesson (Video)"):
- Video, tabs for Overview / Notes / Resources
- Key takeaways with checkboxes
- **New scope:** a real "mark as complete" tracker — per member, per lesson, saved and persisted, not a UI-only tick that resets on refresh. Needs a new table (member × content × completed-at).

---

## 3. Roadmap + Log (combined page)

These two merge into one page — a member looks at their plan and logs time against it in the same place. **This is new scope for the page structure**, not just a reskin: it needs designing as one coherent screen holding both the plan (months → focuses → actions → linked trainings, tick boxes) and the weekly mechanics together.

Layout, per the reference ("07 Your Log"):
- Header: date range (e.g. "7 – 13 September"), day-of-week selector (M T W T F S S)
- Three tabs: **Log** (calendar view), **Timer**, **Insights**
- **Log tab — new: a week-view calendar**, day by day, showing each logged time block colour-coded by its time category (the existing 10 categories)
- **Timer tab** — same function as already built, restyled: cream background becomes **orange**, more visually prominent. No change to the underlying timer logic.
- **Insights tab — new: real charts**, e.g. hours by category this week, as a distinct section separate from the calendar itself

**Roadmap itself is parked** — not designed in this pass. It's currently only a fragment inside the old log page ("on your roadmap" checklist); a full, dedicated Roadmap view (the actual month → focus → action structure a member sees and interacts with) is real, separate scope for a future session. Two known facts to carry forward once that conversation happens: there's a second call at month 3 (30 minutes) for roadmap updates, alongside the initial 1:1 — not currently built anywhere.

Reachable from **two places**, not its own nav destination beyond the combined page itself: a link/card on Piazza, and a link from within the Log side of this same page.

---

## 4. Piazza Sociale (chat)

**Genuinely close to a pure reskin** — channels, DMs, voice notes, read tracking are all real and already built.

- **Layout:** side-by-side room list + thread on desktop. On mobile, WhatsApp-style drill-in — tap a room, see the full thread full-screen, back arrow to return.
- Real message bubbles (distinct style for sent vs received), real uploaded headshots throughout, voice note player with waveform (already built, no changes needed)
- **No online/presence indicator** — drop the "X online" shown in the reference; that's not real, tracked data and won't be built.
- **New scope: reactions.** Four fixed emoji options only (not a full picker) — 🙌 praise hands, 🤩 star eyes, ❤️ red heart, 👏 clap. Tap to react.

---

## 5. Peer pairing

**Mostly a reskin** — the monthly match, the shared-availability check, and the direct link into chat are all real, working data already.

- Two photo squares at the top, member and partner side by side, using real uploaded headshots
- "This month you're paired with [Name]" + online-status dot **is not being built** (no presence tracking, consistent with the chat decision above)
- Shared-availability line, reusing existing data — "you're both free X" or the honest fallback if there's no overlap
- "Message" and "View profile" buttons
- **New scope: three fixed icebreaker prompts**, shown to help structure the call. Exact copy, confirmed:
  1. *"What's one challenge you're struggling with right now that your peer pair could help with?"*
  2. *"What's one idea you want to run by your peer pair for market research?"*
  3. *"What's one thing you want to ask your peer pair?"*
- **New scope: a "booked" tick.** Currently only `met_at` (did they actually meet) and the day-7 stall flag exist. This adds a new, earlier state — a simple checkbox confirming a call's been scheduled, sitting between "matched" and "met."
- Coach case (odd-number month, paired with Nina) uses the exact same card, same treatment throughout — no special-casing.

---

## 6. Archivio

Stays exactly what it already is conceptually — **a personal record**, not a shared resource library. The reference's folder-based layout is a new way of presenting the same personal data, not a different kind of screen.

- Search bar at the top, filtering across the member's own archive
- Folder-style organisation, not a flat list
- **SOPs** folder — existing content (member-written SOPs, unchanged)
- **Past Hot Seats** folder — existing content, but the underlying flow changes (see below)
- **Templates** folder — **new scope**: the member can save a screenshot of something they built in Tools (e.g. a pricing structure) into their archive. Needs the ability to attach an image to a saved archive item.
- **Swipe Copy, Workbooks, Brand Assets — dropped.** Shown in the reference but explicitly not being built.

### The hot-seat SOP flow — a real change to already-built, tested functionality

**Remove:** the existing "Nina writes the build record and publishes it directly to Archivio" screen — this was built and shipped, but is being undone.

**Replace with:**
1. Nina's hot-seat brief-writing stays exactly as built (unchanged) — she prepares this before the session as she always has.
2. After the build happens, Nina leaves a short **comment/prompt** tied to that specific build — new, small field.
3. The **member** writes their own SOP for that build afterward, using the *existing* self-service SOP form (unchanged: name it, what starts it off, what done looks like, whose job it is, steps, tools, walkthrough video). They see Nina's comment alongside the form as guidance while writing it.

---

## 7. Onboarding

Uses the numbered 1-6 path visual style (reference: the "Milestones"-labelled screen, but repurposed — **the real Milestones screen itself is unaffected, see below**).

**Placement — genuinely important detail, not just visual:** this is a **section at the top of Piazza**, not a separate screen. It stays visible until **all six steps are genuinely complete** — not gated on the member's onboarding/active status field, since some steps (the roadmap arriving, the first hot seat) can complete after status has already flipped to active. Needs its own completion tracking across the six steps, independent of the status column.

**Sequence, confirmed:**
1. Fill in the onboarding form
2. Watch the onboarding video (content: still on Nina's own to-do list)
3. Two weeks of time tracking, with its own short explainer video (content: still on Nina's own to-do list)
4. Book the 1:1 call — **week 4**
5. Roadmap arrives (passive — the outcome of the call, not a separate action)
6. Submit first hot seat

---

## 8. Piazza (home/dashboard)

Genuinely the busiest screen — combines the reference's metrics strip with the task-list idea from earlier discussion. In order, top to bottom:

1. **Onboarding progress** (section 7 above) — only while incomplete
2. **Metrics strip:** hours reclaimed this month / weekly goals (roadmap actions ticked this week, shown as "X of Y") / upcoming sessions count
3. Quote of the day + hero image
4. **Task list** — things actually needing action right now: sign off this week's log, say when free for peer pairing, submit the Friday roadmap question, book/add the upcoming hot seat to the calendar
5. **Hot seat, Milestones, and Pairing cards** — each a genuine, working route into that screen, since none of the three has its own nav slot

---

## 9. Milestones — unchanged, do not touch

Confirmed explicitly: stays exactly as already built and tested — real hours-reclaimed thresholds (50/100/250/500/750), the illustrated coastal-road artwork, dated crossings. The 1-6 numbered-path *visual style* shown under "Milestones" in the reference poster is being reused for the onboarding section above, not applied to this screen. Milestones itself needs no design work in this pass.

---

## 10. Settings / Profile

From the reference ("14 Your Profile"), plus one addition:

- Header: "Ciao, [Name]" / member since [date], with avatar
- Your details
- Your progress
- **Notifications** — new, a settings area for turning notifications on/off
- Settings
- Help & support
- Sign out

---

## Explicitly parked / out of scope for this pass

- **Client Reporting** — a separate HTML build entirely, not part of the app redesign.
- **Roadmap's full design** (the actual month → focus → action screen) — needs its own dedicated brainstorm before building; only its entry points and the month-3 call fact are settled here.
- **Milestone rewards** (what happens at each threshold) — already deferred in the product itself, unrelated to this redesign.
- **Community goal target** — still needs a number from Nina, unrelated to this redesign.

## Still needs Nina's own content (not a design or build task)

- Audit questions (already on the standing list)
- Welcome/onboarding video
- Two-week time-tracking explainer video
- Icebreaker prompts — **done, confirmed above**

---

## Summary for Claude Code: genuinely new backend scope in this brief

1. Per-member, per-lesson completion tracking (new table)
2. Week-view calendar rendering of logged time entries, colour-coded by category
3. Real charts for the Insights tab
4. Chat reactions — four fixed emoji, new table
5. A "booked" state on pairings, separate from "met"
6. Image attachment capability for Archivio's Templates folder
7. Removing the Nina-writes-hot-seat-record screen; adding a comment/prompt field on a build, tied to the member's own SOP entry for it
8. Onboarding-progress completion tracking, independent of member status
9. Notifications toggle in Settings

Everything else in this brief is a visual reskin of already-built, already-tested functionality.
