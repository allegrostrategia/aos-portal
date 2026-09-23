# aOS — Monthly Recap Feature

Same pattern already proven for the roadmap and the reveal document: the app assembles and formats real data; Nina drafts the actual celebratory writing with Claude externally; the finished text gets pasted back in through an admin form. No AI runs inside the app for this, consistent with the standing rule.

## 1. The compiler (admin side)

A new admin screen, per member per month, that collates:

**From hard data:**
- Hours logged that month
- Hours reclaimed that month (and running total)
- Roadmap actions completed
- Any milestones crossed
- The hot-seat build confirmed that month (if any)

**From reflection:**
- The member's private Friday check-in reflections for that month, pulled in as source material. This stays private to that one member's own recap — not shared, not posted anywhere else. Consistent with the standing rule that the Friday reflection never feeds a shared space; this is a different, single-recipient use, not a conflict with it.

Output: something Nina can easily copy and paste into an external Claude conversation to actually draft the recap.

## 2. Getting the finished recap back in

An admin form where Nina pastes the finished, Claude-drafted text back in, tied to that member and that month.

## 3. Distribution

- **Email** sent to the member
- **A card on Piazza**: "Your monthly review is here!" — linking through to read it

## 4. After it's been read

Once opened, the recap moves to live permanently under a new **"Monthly reviews"** section on the member's own Profile page (the Settings/Profile screen already built) — building a persisted, growing archive of every past recap for that member.

## Open questions for Claude Code to raise back, not assumed

- Whether "opened" should be tracked properly (a real read timestamp, same pattern as chat's read tracking) or just triggered once Nina sends it
- Exact card/email copy and design — likely Nina's own wording, not something to invent
