# aOS — La Strada: The Roadmap Page

This is the real, full design for the member's own roadmap — replacing the parked placeholder. Naming, confirmed:

- **This page is "La Strada"** — it takes over that name entirely.
- **The existing eleven-station journey map is renamed "The Map"** — its own nav item, own label, unchanged otherwise.
- **The nav grows to 6 items** once this ships: The Map, La Strada, Sociale, Log, and the existing two, each with its own icon.

The attached mockup (`aOS_Roadmap_Mockup.html`) is a genuine, near-complete spec — build from its actual HTML/CSS directly rather than treating it as loose inspiration. It answers most implementation questions itself.

## Architecture — this replaces the separate admin tool

**One page, not two.** A "Member view / Edit (Nina)" toggle sits in the hero itself. This fully replaces the existing separate `/admin/roadmaps` editor — Nina edits directly on the same page a member would see, just with the toggle switched to edit mode.

## Hero

- Eyebrow: "La Strada · Your Roadmap"
- Title: "[Name]'s six-month plan"
- View toggle: Member view / Edit (Nina)
- Overall progress: "Week X of 24" and "X% complete," with a progress bar
- **Background image**: the supplied Amalfi Coast photo (harbour, boats, terrace restaurant), with a **navy overlay at roughly 55% opacity** — same treatment already used on the Grand Hotel Riposo hero. Reuse that existing technique rather than building a new one.

## Month strip

A horizontal, scrollable jump-nav across all 6 months — each one a clickable stop with a dot, showing done / current / upcoming state, jumping to that month's section on the same page.

## Legend

Four bucket colours, matching The Map's existing system exactly — no new colours: Visibility (sky), Launch & Offers (orange), Systems & Delivery (gold), Profit & Pricing (blush).

## Structure — month dividers, then week cards

Each month gets a divider (number, theme name, e.g. "01 · Foundations"). Under each month, **every week in that month gets its own card** — whether populated or empty (showing "Nothing scheduled this week" when there's nothing assigned).

**Worth Claude Code assessing and reporting back on:** does grouping by week work directly from the existing data model (month → focus → actions, each action already optionally assigned to a specific week), or does this need genuine restructuring? Don't assume either way — the display might just need regrouping actions by their existing week field, or it might need something deeper. Flag it rather than guess.

**Each week card, collapsed by default, expandable:**
- Week number + date range
- A completion ring showing % of that week's actions ticked
- When expanded: a category badge (the month's theme), then the action list

**Each action row:**
- A coloured bucket pill (Visibility/Offers/Systems/Profit)
- A checkbox — ticking strikes through and dims the text
- The action text
- An optional "link chip" if the action links to a training (e.g. "Banco Allegro · Pricing calculator")
- In edit mode only: a small pencil icon for Nina to edit that action, and a "+ Add action" link at the bottom of each week

## "Off the itinerary" — new, per month

A free-text box at the end of each month's weeks: *"Anything you did this month that wasn't on the plan"* — a place for the member to note real work that happened outside the formal plan. This is genuinely new — needs its own field, likely one per member per month.

## Months 4-6

Shown as locked/placeholder until they exist: *"Set at your Month 3 call"* — matches the already-confirmed second check-in call at month 3. A note explains weeks 13-24 will follow the same card pattern once populated then.

## Edit mode

When Nina has the toggle on Edit: a banner reads *"You're editing [Name]'s roadmap — changes save instantly, no rebuild needed."* Pencil icons and "+ Add action" only show in this mode; hidden entirely in member view.
