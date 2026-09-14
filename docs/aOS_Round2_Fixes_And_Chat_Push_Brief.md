# aOS — Round 2: Fixes, Corrections, and Chat/Push Expansion

This follows the L'Editoriale redesign brief. Organised by urgency: real bugs/regressions first, then content corrections, then design changes, then the two pieces of genuinely new scope (the hours-reclaimed logic change, and the chat/push expansion).

---

## A. Bugs and regressions — check these against what was already built and tested

Several of these sound like they may have regressed something that worked before this redesign pass. Worth confirming plainly which of these are new breaks versus intentional trade-offs, rather than assuming.

1. **La Strada is barely usable on mobile** — tiny, images unreadable, no names visible. This directly contradicts the version that was built, tested, and phone-confirmed working a few sessions ago. Needs reworking properly for mobile, not just a tweak.
2. **Sociale is wider than the screen on mobile**, requiring horizontal scroll. Also contradicts the explicit WhatsApp-style mobile behaviour confirmed in the original brief.
3. **Cinema Allegro's photo is showing as a random background** in Piazza's stats/metrics section. Not approved — needs a plain brand colour background (e.g. orange) instead.
4. **The hot seat card on Piazza uses an off-palette dark colour.** Stick to the confirmed brand palette.
5. **Wrong image showing on La Strada.**
6. **La Strada says "drag or scroll to move around" but nothing is actually draggable or scrollable** at the current (broken) mobile size.
7. **No calendar is visible anywhere on the Log page.** This was core, explicitly requested scope (a week-view calendar, time entries colour-coded by category) — confirm why it's missing despite being listed as built in the last summary.
8. **The PWA home-screen icon still shows plain text/letters**, not the actual aOS mark (navy background, orange/blush logo — the same icon already generated and placed in `public/brand/` weeks ago).
9. **Peer pairing calendar needs actual dates shown**, not just day-of-week labels.
10. **The three peer-pairing icebreaker questions are missing entirely** from the pairing page, despite being confirmed and built into the original brief. Exact wording, unchanged:
    - *"What's one challenge you're struggling with right now that your peer pair could help with?"*
    - *"What's one idea you want to run by your peer pair for market research?"*
    - *"What's one thing you want to ask your peer pair?"*

---

## B. Content corrections

1. **Remove all em dashes, everywhere in the app's copy.** Do a real pass across every screen, not spot fixes.
2. **"Same dreams. More done." is not the real tagline and should not appear anywhere.** The actual tagline is: **"Time reclaimed, not time off."**
3. **Soften "it's fifteen boxes"** in the peer-pairing availability copy — it currently overstates the effort involved in saying when you're free.
4. **La Strada needs a short description line**, e.g. *"All trainings and resources live here."*

---

## C. Design/UX changes

1. **Stations must always show in full colour — never greyscale.** This reverses the earlier visited/not-visited greyscale feature (built and tested a few sessions ago) — that distinction is being dropped entirely. Every station, colour, always, regardless of visit status.
2. **Mobile bottom nav sits too high, leaving a block of white space below it.** Likely a missing safe-area inset — the fix should reserve space for the iOS home indicator using `env(safe-area-inset-bottom, 0px)` added to the nav's bottom padding, not just a fixed pixel value. (Pattern reference available if useful — a comparable nav component from another project handles this exact case.)
3. **Drop the Fit / Closer / Closest zoom levels on La Strada — one single, fixed view only.**
4. **Sociale should open to the General channel by default**, with other conversations available to toggle to from a list at the top, rather than landing on an empty/ambiguous state.
5. **Member directory listings need restructuring:**
   - Show a name and a link — not a "how to work with them" framing
   - Split into two separate boxes: **"What my business is all about"** and **"A bit more about me"**
6. **Piazza needs a link to Roadmap** (already agreed it has no nav slot of its own — reachable via Piazza and the Log page).
7. **Piazza's hot seat card must show that member's actual confirmed hot seat for the current month**, with a clear, honest placeholder when nothing's been confirmed yet — not blank, not generic.

---

## D. Hours-reclaimed ledger — a real change to already-built logic, confirmed deliberately

**Current behaviour (built and tested):** a build's weekly rate only accrues in weeks where the member logs 10+ hours **and** submits their log. This was a deliberate decision, reasoned through carefully at the time (submission as the only signal a week's data is complete) and explicitly approved.

**Confirmed new behaviour:** this gate should not apply to the ledger at all. A build's confirmed weekly rate should **accrue automatically every week it's active**, with no dependency on tracked hours or submission that week. The two ideas are now explicitly separate:
- **Hours-reclaimed ledger** — purely about active build rates, accruing every week, unconditionally
- **The 10-hour-tracked-and-submitted threshold** — stays, but only as the existing, separate qualifying condition for the **monthly prize draw**, which already has its own independent eligibility logic. No other change needed there.

This touches real, tested ledger code (`accrue_hours_for_week` and its weekly job) — treat with the same care as any other change to a number members see and rely on. Confirm the actual accrual mechanism (still weekly via the existing cron, just unconditional) rather than assuming.

---

## E. Chat overhaul — building on top of the existing system, not replacing it

**Explicitly confirmed: keep everything already built** — channels, direct messages, voice notes, the existing 4-emoji reactions, existing read tracking. This is additive, layered on top, not a schema replacement.

**Bringing over from the reference implementation (a working chat system from another project), adapted to fit on top of aOS's existing structure:**

1. **Message pins** — admin can pin a message per channel; a message can only be pinned once; unpinning is admin-only. If a pinned message is later deleted, the pin should be removed automatically (cascade), not left dangling.
2. **Image messages** — members can send an image in chat, alongside existing text and voice notes. Needs its own private storage bucket (separate from voice notes), signed-URL delivery (never a public URL), member uploads scoped to their own folder, and the same care already applied elsewhere in this build against one member's message pointing at another member's uploaded file.
3. **Message search** — real search across message content, not a naive `LIKE` scan (needs a proper text-search index, given message volume will only grow).
4. **Message retraction — confirmed, reversing the existing rule.** Members can now delete their own sent messages. **This is a deliberate reversal of the standing "no edit or delete, ever" rule** built for this chat system specifically because check-in responses were meant to be a permanent record — flagging clearly so this is understood as an intentional, confirmed change, not an oversight. Admin can still delete anyone's message, as already built. A retracted message should cleanly remove any reactions and pins attached to it.
5. **"Posted as admin"** — Nina's own messages in group channels should be visually distinguished as coming from her/the coach, so members can tell an announcement from a peer message at a glance.

**Not changing:** the existing 4 fixed emoji reactions stay exactly as built — no expansion to open/any-emoji.

---

## F. Push notifications — confirmed in scope, with a known caveat

**Confirmed: build this now, in this same pass** — reversing the earlier decision to treat it as its own separate session. Worth restating the honest trade-off that decision was protecting against, so it's not lost: push notifications need testing on a **real physical iPhone** (the simulator can't test push properly), and each device's notification permission can only be granted **once** — denying it can't be undone without clearing real device data. That testing will need to happen as its own careful pass once this is built, even though the build itself is happening now.

**What this needs, concretely:**
- A subscription mechanism (storing each device's push subscription per member)
- Sending a real push notification on new chat messages and reactions
- A service worker capable of receiving and displaying a push notification, including deep-linking into the correct conversation when tapped
- Four secrets that need setting in Vercel/Supabase (not just code): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and a webhook secret — these live in dashboard configuration, not in any file, and need to be generated and set as part of this work, clearly documented once done (the same way other hard-won environment-variable lessons from this build have been recorded in `CLAUDE.md`)
- Notification preferences — a way for a member to control what they get notified about (already planned for the Settings/Profile screen's "Notifications" toggle from the earlier brief)

---

## Summary — what's genuinely new scope in this round

1. Hours-reclaimed ledger: remove the 10hr+submission gate from accrual (keep it only for the draw)
2. Chat: pins, image messages, search, message retraction, posted-as-admin
3. Push notifications: full new infrastructure, plus real device testing as a distinct follow-up step
4. Directory listing restructure (name+link, two content boxes)

Everything else in this document is a bug fix, a content correction, or a straightforward design change to something already built.
