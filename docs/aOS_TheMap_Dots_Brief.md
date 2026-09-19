# aOS — The Map: Pulsing Dot Markers + Hover/Tap Cards

**This corrects an earlier draft of this brief — that version was wrong and should be disregarded if you've seen it. This is the real spec.**

The map's background images (landscape and portrait) are **unchanged** — this is purely about what renders at each station's position, and a new interaction layer on top. Every station's already-validated position, the hub-and-spoke lines, and the land-mask safety tests all carry over untouched.

The reference file (`allegro-final-map.html`) shows the exact visual style to match for the dot and label — read its actual CSS directly (dot size, the pulse animation, the pill-label styling) rather than approximating it.

## What changes

**The current photo-tile markers are being replaced entirely** with a small **pulsing dot** next to a pill-shaped **name label**, visible by default — matching the reference file's actual styling for `.hotspot` and `.hotspot-label` precisely. The pulse is pure CSS animation (a ring scaling up and fading out on a loop), no JavaScript driving it.

Reasoning, so the intent is clear: showing every station's full photo at once currently looks cluttered. Hiding the photo behind an interaction, and showing only a clean dot and name by default, is meant to look calmer and more professional.

## The card — appears on hover (desktop) or tap (mobile)

Contains:
- A small kicker/eyebrow line
- The station name, as an italic serif heading
- **A one-line description** — pulled from that station's existing description field, trimmed or shortened as needed to fit on one line (not new copy to write)
- **A real photo of the station** (the existing station image — this is genuinely part of the card, unlike the reference file's own card which has no image)

## Interaction, precisely

- **Desktop:** genuine `:hover` opens the card (not click) — mouseover shows it, mouseout hides it. **Clicking the dot separately navigates directly to that station's page**, independent of hovering.
- **Mobile:** tapping the dot opens the card (there's no hover on a touch device). No scroll-panning or parallax — the existing static portrait image stays exactly as built.

## What stays exactly as is

- Both map background images, unchanged
- Every station's percentage-based position
- The hub-and-spoke line topology
- The land-mask safety tests (these test positions, not marker style — still valid)
- The burger-menu list view
