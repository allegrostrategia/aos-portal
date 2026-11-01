# Every link, button and toggle at ink/70

Six before-and-afters from the sweep of 1 November 2026. Each picture is
the same element twice: the share it used to be drawn at on top, the share
it is drawn at now underneath. Nothing else on the row changed.

14px and 12px are both *normal* text by WCAG 1.4.3, so every one of these
owed 4.5:1 and none of them had it. On the cream ground:

| share | contrast | where it was |
|---|---|---|
| ink/40 | 2.44:1 | "Remove this template", "Remove" in the library |
| ink/50 | 3.21:1 | "As a table", "Discard", several `<summary>` rows |
| ink/55 | 3.71:1 | reporting's "retire this" links |
| ink/60 | 4.32:1 | the twenty-four found by the first grep |
| **ink/70** | **5.93:1** | all forty-one now |

The worst of the four surfaces these land on is the cream card, at 5.86:1.

| file | element | size | surface |
|---|---|---|---|
| `1-piazza-all-steps-small.png` | "All steps" on Piazza | 14px | cream |
| `2-piazza-ive-done-this-caption.png` | "I've done this" on the onboarding path | 12px | cream |
| `3-directory-clear-caption.png` | "Clear" on the member directory | 12px | cream |
| `4-admin-edit-details-small.png` | "Edit details" in the reporting admin | 14px | white card |
| `5-reporting-edit-setup-small.png` | "Edit setup" on the Offers entry screen | 14px | white card |
| `6-admin-library-remove-caption.png` | "Remove" in the library admin | 12px | cream card |

The last is the ink/40 case — 2.44:1 to 5.93:1, the largest of the forty-one.
"Unpublish" beside it was ink/70 in both halves, so it reads as the reference.

**It cannot drift back.** `scripts/check-icon-circles.mjs` reads `src/` and
fails on anything that is both interactive and drawn below ink/70, naming
the file and line. Putting one link back to ink/60 is what proved it.

Still outstanding, and deliberately: 117 uses of `text-ink/60` on *static*
secondary text, which fail 1.4.3 by the same arithmetic.
