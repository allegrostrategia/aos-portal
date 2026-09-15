# aOS — Round 3: Weekly Check-Ins Channel + Hot Seat Prep Flow

## A. New chat channel: "Weekly Check-Ins"

A fourth standing **shared group channel**, alongside the existing General / Wins / Time-tracking. Confirmed shared, not private — every member sees every other member's Friday check-in and Nina's replies. This is a deliberate choice, not an oversight.

**Time-locked:** the channel is only open **Monday, 2:00pm–3:30pm**. Outside that window, it shows a clear "locked" state rather than being fully hidden or unusable in a confusing way — a member should understand why they can't post, not just find a dead end.

This replaces/formalises the existing "Friday submit, Monday reply in chat" mechanic — worth confirming with Claude Code whether the existing weekly-log free-text submission still feeds into this channel, or whether Friday submissions move into this new channel too. Flagging this as a real open question for Claude Code to raise back, not assumed.

---

## B. Hot seat prep flow — a real redesign of the submission and lead-up to each month's call

### The reflection form — new, additive

Alongside the **existing 3 questions** (What are you stuck on? / What have you tried? / What does "done" look like?) — which stay exactly as they are — add a new section prompting the member to:

- Look back at their own log from the past month
- Reflect on what's actually been eating their time
- Decide what they'd like to optimise, streamline, or make more efficient
- Or say plainly "not sure yet" if they genuinely don't know

No change to submission timing — the existing reminder schedule (7-day, 2-day) stays exactly as built. Members can still submit any time before that, earlier if they want to.

### Nina can edit the submission, not just read it

The submission box needs to become genuinely two-way. Nina should be able to add her own notes/suggestions directly on a member's submission **before the call**, not just view what they wrote.

### Notification when Nina comments

The moment Nina leaves a note on a member's submission, two things should happen:
1. A **push notification** to their phone (infrastructure already built and working — reuse it)
2. A **flag on their Piazza**, something like: *"Nina's left a comment on your hot seat — go review it before the call"*

### Member can reply

This becomes a genuine back-and-forth thread, not a one-way note. The member should be able to comment back on what Nina's written.

**Note for Claude Code, not for the product:** each member effectively gets ~5 minutes of live call time — this is internal planning context for how Nina prepares, and should never appear anywhere in the member-facing copy.

### After the hot seat — the confirmed build

This reuses the **existing confirmed-challenge mechanism** (already built, evidence-based, not AI-drafted) — no new backend logic needed for the confirmation itself. Two real additions:

1. **Distinct visual treatment** — the confirmed build should sit in its own box, visually different (colour/styling) from the discussion thread above it, so it's unmistakably "this is what we're actually doing," not just another comment.
2. **Archive-swap behaviour** — once the confirmed build exists, the earlier discussion/comment thread should hide by default, replaced by a **"View archived comments"** toggle. Clicking it reveals the old thread; the default view just shows the confirmed build cleanly.

---

## Summary of what's genuinely new scope

1. A new shared, time-locked group channel (Weekly Check-Ins)
2. A new reflection-prompt form section on hot seat submissions (additive, not replacing anything)
3. Making the submission box editable by Nina, not just readable
4. A new comment/reply thread on each submission (two-way, not one-way)
5. Push notification + Piazza flag, triggered specifically when Nina comments
6. New styling for the confirmed-build box, distinct from the discussion thread
7. The hide/archive-swap UI behaviour once a build is confirmed

Everything else referenced (the 3 existing questions, the confirmation mechanism itself, the 7-day/2-day reminder schedule, push notification infrastructure) stays exactly as already built.
