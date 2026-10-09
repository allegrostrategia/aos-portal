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
