# aOS — Peer Pairing: Date-Specific Availability (replaces the weekly pattern)

## What this replaces

The current system asks each member to tick a recurring weekly pattern (which weekdays/time-of-day buckets they're generally free) — this was flagged as A9 a few rounds back, and it's now confirmed being replaced entirely, not kept alongside the new system. Reasoning, confirmed directly: people don't have the same availability every Monday, so a recurring pattern was never actually representing real availability.

## The new mechanic

1. Each member, for the relevant month, **selects every specific date and time slot they're actually free** — real calendar dates, real specific times (not broad buckets like "morning/afternoon"). They click as many slots as genuinely work for them, the more the better, since more selections mean a higher chance of finding a real overlap with their partner.
2. **The moment the second partner in a pairing submits their picks, the system immediately checks for any overlap** between the two members' selected slots — no waiting for a scheduled job, this runs right on submission.
3. **If there's a match** (any date+time both selected), both partners get a message:
   > *"You and [Name] are both free at [Time] on [Date] — send them a message to confirm your call!"*
4. **If there's no overlap at all**, both partners instead get:
   > *"You and [Name] haven't both picked a time slot that you're both free — message [Name] to work out a slot that works for you both."*

Both messages should go out the same way other pairing notifications already do — worth confirming with Claude Code whether that means push notification, in-app, or both, matching the existing pattern for the pairing-booked message.

## What this touches, so it's treated with real care

This changes the shape of stored data, not just the UI — `pairing_availability` moves from a recurring weekday/time-bucket pattern to a member-curated set of specific date+time slots per month. The existing overlap-matching logic needs rewriting to compare two sets of specific slots rather than two boolean pattern-grids. The pairing card itself (the one showing "this month you're paired with X," the two photos, the icebreakers) already has a line derived from availability matching — that line needs updating to reflect the new logic, not built fresh.

Treat this the same way the hours-reclaimed ledger change was treated a few rounds back: a deliberate, confirmed reversal of real, already-tested behaviour, not an addition sitting quietly alongside the old system.
