# aOS — Round 4: Full Screen-by-Screen Review

Organised by screen, in the order reviewed. La Strada's portrait artwork is deliberately excluded — that needs its own reference-image pass first, handled separately.

---

## Global

1. **Status bar overlap on iPhone.** The header (logo + nav) sits too high and gets covered by the phone's own clock/status bar on every screen. Needs to drop down slightly so it's never obscured.
2. **In-app header logo needs to be a real mark, not text.** Currently the "aOS" wordmark in the header is styled text. This needs to become an actual logo graphic — likely adapting the existing orange/blush icon already built for the home screen, though a version without the solid background square may suit a slim header better than the full square icon. Worth Claude Code's judgement on the exact treatment, flagged back if genuinely unclear.
3. **Greeting time-of-day variation — confirm whether this is already built.** Does "Buongiorno, [Name]" already change to Buonasera/Buonanotte etc. depending on time of day, or does this need building?

---

## Onboarding

4. **Rename the section** from "Your first weeks" to something like "Your onboarding steps" — exact wording open, propose something clean.
5. **Reword the completion copy** — "six steps to be fully in" sounds odd; something like "six steps to complete your onboarding."
6. **Reorder the sequence:**
   - Watch the onboarding video **first** (so they understand how everything works before anything else)
   - Then: two weeks of time tracking **and** the onboarding form happen in **parallel** — tracking doesn't block the form, and the form doesn't need tracking to be finished
   - Book the 1:1 call once the **form** is complete — **not gated on time tracking being fully finished**, since tracking can still be running in the background
   - **"Roadmap arrives"** — this step should visually complete/change (colour or similar) automatically once a real roadmap actually exists for that member, not require manual ticking
   - **"Submit your first hot seat"** — this step should stay **locked** until "Roadmap arrives" is complete, then unlock

---

## Piazza

7. **Quote replacement** — change to: *"Time reclaimed, freedom every day."*
8. **"Upcoming session" stat — replace entirely** with a count of weekly check-ins submitted this month.
9. **Check whether the "add hot seat to calendar" deadline shown is real or test data.** A specific date/time (e.g. "Friday 18 September at 22:29") was shown as some kind of add-to-calendar deadline, which doesn't make sense as a concept — worth confirming this is leftover test data rather than a real, intended feature.

---

## Hot seat

10. **Add a month picker** so a member can look back at previous months' submissions, not just the current one.
11. **Copy change:** "with a specific direction drafted" → *"with a specific plan of action that Nina will work on ahead of your hot seat."*
12. **The three questions are being fully replaced**, not kept alongside the new ones. New set, confirmed wording:
    1. *"What is making you feel stuck at the moment?"*
    2. *"What is taking up a lot of your time at the moment?"*
    3. *"What are you doing right now that you don't think you should be doing, or that someone else could do instead, that you don't enjoy?"*
    4. A fourth question building on the above — needs clean wording. Proposed: *"Based on this, what would you like your hot seat to focus on? If you're not sure, just say so — Nina will help you decide."* The layout/placement of this question in its own (yellow) box is already right — only the wording needs finalising.
13. **Yellow box label change:** "what your month says and what you'd streamline" → *"what you'd like to hot seat."*
14. The "not sure yet" checkbox stays exactly as is — confirmed working well.

---

## La Strada

15. **List view (burger menu) is confirmed good, no changes.**
16. Portrait artwork — **excluded from this brief**, handled as its own piece of work.

---

## Sociale (chat)

17. **Sender name and avatar are missing from messages.** Each message should show the sender's name and their headshot next to it, WhatsApp-style — this appears to be a real gap against what was originally built.
18. **"Add a picture" should be a proper image icon**, not a text label — the standard photo/image icon used elsewhere.
19. **Reactions need to work WhatsApp-style.** Currently all four reaction options show under every message by default. Instead: one small "react" icon per message; tapping it reveals the four options to choose from.
20. **Nav bar alignment bug** — the "Dominic" DM tab sits lower/misaligned compared to the other channel tabs at the top. Needs to align with the rest.
21. **Add a burger menu** for switching between channels **and** starting a new direct message — this is **additive**, alongside the existing member-directory route, not a replacement for it.

---

## Log

22. **Copy fix:** "10 hours more makes it a complete week" is misleading — it should make clear this is specifically about **monthly prize draw eligibility**, not a requirement for the week to "count" more broadly. Something like: *"10 hours makes you eligible for this month's prize draw."*

---

## You / Profile

23. **"Help & support" button needs wiring up** — should open an email addressed to `contact@allegrobusinessservices.co.uk` (a `mailto:` link).
24. Everything else on this screen (name, details, headshot, what-you-do, progress) confirmed good, no changes.

---

## Roadmap

25. **There's currently no visible, findable place for a member to actually view their own roadmap.** Either it isn't built yet, or it exists but isn't discoverable — worth Claude Code confirming which, given the Roadmap page's full design was deliberately parked as its own future conversation.
26. **Still want a walkthrough of creating a real test roadmap**, to see what a member's actual experience looks like once one exists — this doesn't need new build work, it's about using what's already in `/admin/roadmaps` to generate real test data.

---

## Explicitly not in this batch

- **La Strada's portrait artwork** — needs its own reference-image generation pass before any rebuild work starts.
- **Milestone rewards** — already tracked as deferred, not dropped; no new action, just a standing reminder Nina still needs to decide the actual prizes.
