# Stage 6 — Meta CSV uploads

Plan · 9 October 2026 · not started

The last stage before Nina's single review. Stages 4 and 5 are built and switched off; this one joins them, and then the three switches move together.

---

## What it does

§10, in one sentence: **a CSV is a shortcut that fills boxes for a person to check, and nothing else.**

> The person drops a file on the upload card on an entry page. The app reads the column headers in the browser, matches them to fields, and fills the matching boxes. Filled boxes are highlighted. **Nothing saves until they press Save.**

Two files in this build: the **Meta Business Suite content export** (fills Social Media) and the **Meta Ads Manager campaign export** (fills Ads). Email platforms stay manual — the HeyClients sample is a PDF of charts, and ActiveCampaign, Kit and Flodesk have no sample at all. Financials is manual for good: payment exports carry names, emails and card details, which breaks the numbers-only rule.

**The file is never stored.** Only the numbers taken from it, and a record that an import happened.

## What is already built

- **`report_csv_imports`** — workspace, file name, platform, month, who uploaded, which fields were filled. Append-only by design: it is the evidence of where a figure came from.
- **`report_column_maps`** — workspace, platform, column name, maps to `leads | purchases | ignored`. This is §10.2's custom conversions: a client names their own conversion event, ticks what it counts as, and the choice is remembered.
- A `platform` enum with `meta_content` and `meta_ads`.
- Every figure the importer fills already exists as a metric, with its entry screen and its calculations.

So Stage 6 is a parser, an upload card, and one screen for the column maps.

## What is left

1. **The parser**, as a pure module with no DOM and no network — `src/lib/reporting/csv/`. Two readers over one CSV tokeniser. It is the whole of the risk and almost none of the screen, so it gets unit tests first and heaviest.
2. **The upload card** on the Social Media and Ads entry pages: a file input, a summary of what was filled, a list of what it could not fill, and highlighted boxes.
3. **The custom-conversion screen** (§10.2): on first upload, any unrecognised conversion column is listed and the client ticks what it counts as. Saved per workspace per platform.
4. **The import record** written on save, not on upload — nothing happened until the figures did.
5. **`STAGE_6`**, and every surface asking it.

## The rules that make this hard, all from §10

These are the parser's real specification, and each one is a test:

- **Reach is never summed.** Post reach double counts people who saw several posts and misses stories; in the sample, posts summed to 18,000 against an account reach of 30,000. Campaign reach has the same problem. **Left blank for the person to type**, with the card saying why.
- **Dates differ per file.** The content export is US format (MM/DD/YYYY); the ads export is ISO (YYYY-MM-DD). Parsed month-first and year-first respectively, never guessed from the value — 03/04 is ambiguous and the wrong read is silent.
- **Figures are lifetime totals to the export date.** Only posts published *in the report month* count, so the parser filters by publish date and says how many rows it ignored.
- **Never sum the Results column** in the ads export. It means something different per campaign. `Result indicator` labels each campaign's goal.
- **Skip campaigns where Amount spent is 0** — four of the nine in the sample.
- **"Amount spent (" is matched by its start**, because the currency in the brackets changes per client.
- **Cost per lead uses lead campaigns' spend only.** Already built and tested; the importer must not undo it by blending.
- **Captions are never stored.** Description, Permalink and the IDs are read past and dropped.
- **Trial Reels cannot be filled** — the file does not mark which reels were trials.

## Testing

- **Unit, first and heaviest.** The parser is pure: a fixture CSV in, a set of figures out. The sample's worked checks are the assertions — spend £600.00, impressions 60,000, link clicks 4,200, leads 100 (60 lead form + 40 opt-in). Malformed files, quoted commas, a missing column, an empty file, a file from the wrong platform, and a date in the other format all get a case.
- **Harness** — the column maps through the real actions as the real people, and the import record.
- **Browser, both widths** — a real file dropped on a real screen, boxes filled and highlighted, and **Save still required**. Plus the production-flag spec, as Stage 5 taught: Stage 6 adds a card to entry screens people already open.
- **Mutation testing** on every rule in the list above, one at a time.

## Decisions that are Nina's — recommendation for each

Added to her running list as they are taken, under the standing arrangement.

**1. What the card says when a column is missing.** *Recommend naming the fields it could not fill, and leaving them empty and editable* — not zero, which §4's dash rule exists to prevent.

**2. Whether an upload can overwrite a box that already has a figure in it.** *Recommend yes, with the changed boxes highlighted as filled-from-file, because the person still has to press Save.* Refusing would make a correction impossible without clearing by hand.

**3. What happens when the file is for the wrong month.** *Recommend filling nothing and saying so*, with the months the file actually covers. Partially filling from a file that is mostly a different month is the quietest way to get a wrong report.

**4. Whether a client sees the upload card at all.** *Recommend: only somebody who can edit*, which is Allegro for a retainer and the member themselves for self-serve — the same line everything else draws.

---

## Four answers, before building (Dom, 9 October)

### The raw CSV is never stored

**Parsed in memory, in the browser, and discarded.** What survives is the figures the person saves and a `report_csv_imports` row — file name, platform, month, who, and which fields were filled.

The brief already says it ("The file itself is never stored, only the numbers taken from it"), and the reason is worth keeping in view: a Meta content export carries post descriptions and permalinks, and an ads export carries campaign names a client may not want sitting in somebody else's database. Nothing is stored, so nothing has to be protected, found later, or deleted. There is no bucket, no retention rule and no access question — which is the cheapest possible answer to all three.

The file name is kept because "which export was this from" is the question somebody asks when a figure looks wrong, and a name is not content.

### Re-uploading the same month replaces, never doubles

The parser produces a **set of figures**, and the form writes them the way the entry screen writes anything typed: one value per workspace, month, metric and entity. A second upload fills the same boxes again and Save overwrites. There is no appending anywhere in the path, and `report_values` has no shape that would allow two.

The danger is not the write, it is the **arithmetic**: a sum that started from what is already in the box would double. So the parser never reads the current value — it returns totals computed from the file alone, and the form replaces.

Tested both ways: the same file twice gives the same figures, and a corrected file replaces rather than adds to them. A second `report_csv_imports` row is written, because two uploads did happen and that table is the record of what came from where.

### Uploading into a published month is refused, in words

A published month is locked: `guard_report_published_month` refuses every write to `report_values`, and would answer an upload with `new row violates...` or a raw check-violation message. That is not something to show anybody.

So the upload card **is not rendered at all on a locked month**, and the save action refuses with `LOCKED_MESSAGE` — the same sentence the entry screens already use, which names unpublishing as the way through. The card's place is taken by the lock notice that is already there.

Tested at both widths, because the card is a layout as well as a rule, and the thing being checked is that nobody is offered a button that cannot work.

### Who can upload

**Team only, on retainer workspaces. A member's Meta figures stay manual for now** — Dom's call, taken.

The card asks `canEdit && kind === "retainer"`, so a retainer client never sees it (they do not enter figures at all) and a member does not either, although they are their own editor everywhere else. That is the one place Stage 6 draws a line that nothing else in the product draws, and it is deliberate: every "my CSV didn't work" lands on Nina, and standing rule 5 is that her time does not scale with member count.

The cost is honest: a member fills in Social Media and Ads by hand, which is the most tedious part of their month, and they are the people who would gain most from the shortcut. Turning it on later is one condition in one place — the parser, the maps and the screens are identical. On Nina's list as decision 34, so she can weigh the tedium against the support.
