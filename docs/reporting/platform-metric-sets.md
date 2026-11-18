# Social Media: a figure set per platform

**Answered by Nina, 16 November 2026.** Written 15 November; her answers
are in the box below and each one is repeated where it lands. Nothing here
is a question any more — it is what gets built, after Leads & Conversions.

> 1. The four sets are approved as written.
> 2. Kinds: Instagram, LinkedIn, TikTok, YouTube, **Facebook** (its own set:
>    followers, reach, post engagements, reactions, comments, shares, link
>    clicks, page visits; post types photo, video, reel, link, text) and
>    **Other** (the general set).
> 3. YouTube: CTR and average view duration are **typed**, not worked out.
> 4. LinkedIn: **add DMs from content** as optional.
> 5. Yes to the platform kind picked from a list.

Right now every platform is asked for the same fourteen figures, because
there is only one Social Media list and it was written for Instagram.
That is why LinkedIn shows saves and a share rate, and why its post
types are reels and carousels. The fix is one list per platform.

---

## The decision this needs first

A platform today is **just a name**. "Instagram" is a row with the word
Instagram in it; nothing in the system knows what kind of thing it is.
Changing that is the one structural change here:

**Each platform gets a kind** — Instagram, LinkedIn, TikTok, YouTube, or
Other — chosen from a list when it is added, and shown with its icon.
Every figure is then tagged with the kinds it belongs to.

- **Why not match on the name?** A client who calls theirs "IG — main"
  or "Our LinkedIn page" would get the wrong set, and a client called
  "Instagram Ads" would get Instagram's. There is already one place that
  guesses from the name (`looksLikeMeta`, for the CSV import) and it is
  exactly the kind of thing that works until it doesn't.
- **"Other"** gets the general set — followers, reach, views,
  engagement — so a client on Pinterest or Threads is not stuck.
  **Saves are in it from 18 November** (Nina): Pinterest is the platform
  this set was written for, a save is the whole of how Pinterest is
  read, and the general engagement rate was already counting saves in
  its arithmetic without ever offering a box for them.
- **Nothing already entered is lost.** Figures are already stored per
  platform; this only changes which boxes are *shown*. A figure that
  stops being asked for stays in the database and keeps appearing on the
  months it was entered for (rule 7).

**Answered (Nina, 16 November): six kinds** — Instagram, LinkedIn, TikTok,
YouTube, Facebook and Other, picked from a list when a platform is added.
Facebook gets a set of its own rather than the general one, because its
figures are named differently from Instagram's and the difference is the
whole point of doing this: followers, reach, post engagements, reactions,
comments, shares, link clicks and page visits, with post types photo,
video, reel, link and text. Pinterest stays on the general set under
"Other" until a client is actually on it.

---

## Instagram

| Figures entered | | Rates worked out |
|---|---|---|
| Followers at month end | Saves | Net follower growth |
| Posts published | Shares | Follower growth % |
| Reach | Profile visits | Engagement rate |
| Views | Link clicks | Save rate |
| Likes + comments | | Share rate |
| | | Reach per post |
| | | Profile visit to follow |

Optional: follows gained, DMs from content, keyword comments, reach from
followers / non-followers (and the non-follower reach % that comes off
them).

**Post types:** Reel · Carousel · Photo · Story

*This is today's set. Nothing is lost.*

---

## LinkedIn

| Figures entered | | Rates worked out |
|---|---|---|
| Followers at month end | Reposts | Net follower growth |
| Posts published | Profile views | Follower growth % |
| Impressions | Link clicks | Engagement rate |
| Members reached | | Click-through rate |
| Reactions | | Impressions per post |
| Comments | | Profile view rate |
| DMs from content | | |

**Post types:** Text · Image · Document / carousel · Video · Poll · Article

**What changes from today:** reach becomes **impressions** and **members
reached** — LinkedIn reports both and they are different numbers.
Likes + comments splits into **reactions** and **comments**, because
LinkedIn counts them separately. **Saves and shares are gone**; reposts
replaces shares. Engagement rate is measured against impressions, which
is how LinkedIn reports it. **DMs from content is optional and added on
Nina's answer of 16 November** — it is where a lot of service-business
conversations actually start, and the figure already exists for
Instagram, so it is the same box on a second platform rather than a new
one.

---

## TikTok

| Figures entered | | Rates worked out |
|---|---|---|
| Followers at month end | Comments | Net follower growth |
| Posts published | Shares | Follower growth % |
| Video views | Favourites | Engagement rate |
| Profile views | | Views per post |
| Likes | | Profile view rate |
| | | Favourite rate |

**Post types:** Video · Photo carousel · LIVE

**What changes from today:** reach becomes **video views**. Likes +
comments splits. **Favourites** is new and is TikTok's equivalent of a
save. Engagement rate is measured against video views.

---

## Facebook

**Nina's addition, 16 November**: its own kind rather than the general
set, because Facebook's figures are named differently from Instagram's
and showing a page saves and a share rate is the problem this whole
document exists to fix.

| Figures entered | | Rates worked out |
|---|---|---|
| Followers at month end | Shares | Net follower growth |
| Posts published | Link clicks | Follower growth % |
| Reach | Page visits | Engagement rate |
| Post engagements | | Reach per post |
| Reactions | | Click-through rate |
| Comments | | Page visit rate |

**Post types:** Photo · Video · Reel · Link · Text

**What changes from today:** **post engagements** is Facebook's own
headline figure and has no Instagram equivalent, so it is entered rather
than worked out. Likes + comments splits into **reactions** and
**comments**. **Saves are gone** — a page does not have them. **Profile
visits becomes page visits**, which is the same idea in Facebook's words
and worth getting right on a page a client reads.

---

## YouTube

| Figures entered | | Rates worked out |
|---|---|---|
| Subscribers at month end | Impressions | Net subscriber growth |
| Videos published | Click-through rate | Subscriber growth % |
| Views | Average view duration | Views per video |
| Watch time (hours) | | Watch time per view |

**Post types:** Long-form · Short · Live

**What changes from today:** followers are **subscribers**, and the word
should change on screen. **Watch time** is the figure YouTube is
actually judged on and nothing else here has an equivalent. Likes,
saves, shares, profile visits all go.

**Settled (Nina, 16 November): both are typed.** Click-through rate and
average view duration are *given* to you by YouTube Studio, and both can
also be worked out (CTR = views ÷ impressions; average duration = watch
time ÷ views) — which is exactly why only one of the two may be on the
screen. YouTube counts a view differently from an impression-click, so
the typed figure and the worked-out one would disagree on the same page,
and YouTube's own is the one Nina would quote. So they are entered
figures, and the worked-out versions are not drawn at all.

---

## What this touches

| | |
|---|---|
| **Entry screens** | Boxes follow the platform. Switching the pill changes which boxes are there, not just their values. |
| **Report pages** | Cards, rates and charts follow the platform. "Everything else this month" lists that platform's optional figures only. |
| **Top posts** | The post-type list follows the platform. A LinkedIn post cannot be a Reel. |
| **Targets** | A target belongs to a figure on a platform, so only that platform's figures are offered. |
| **The Overview** | Still shows one Followers figure, from the main platform — never a sum across platforms, which would count the same person twice. If the main platform is YouTube it should read **Subscribers**. |
| **CSV import** | Meta's export fills Instagram. LinkedIn, TikTok and YouTube have their own exports with different columns — **out of scope for this round** unless Nina wants it now. |
| **Demo data** | Four platforms, each with its own figures, rates and post types. |

## What came back (Nina, 16 November)

1. **The four sets are approved as written.**
2. **Six kinds**, with Facebook its own — set out under "The decision this
   needs first" above.
3. **YouTube's CTR and average view duration are typed.** They come off
   YouTube Studio as figures somebody can read, and working them out here
   would need impressions and total watch time, which are two more boxes
   to get a number already on the screen in front of them.
4. **LinkedIn carries DMs from content**, optional, the same as
   Instagram's.

Order: this is built after Leads & Conversions (Dom, 16 November), with the
demo data updated so each platform shows its own figures, and screenshots of
Social Media on every platform.

---

## What was built, 17 November 2026

Two commits, two migrations, in this order.

**Step 1 — a platform knows what kind of thing it is.**
`report_entities.platform_kind`, a six-value enum, nullable, picked from a
list on the Social Media entry card with a **Needs a kind** badge where
nobody has said. The one-off backfill guessed from the name over the five
rows that existed and got all five right; from then on the kind is stored
and the name decides nothing.
`20261117100000_a_platform_has_a_kind.sql` — **applied to live.**

**Step 2 — the figures follow the kind.** Eighteen new metrics, and
`src/lib/reporting/platform-metrics.ts` holding which kinds ask for which.
`20261118100000_a_figure_set_per_platform.sql`.

### Where the rules ended up

| | |
|---|---|
| **Which kinds ask for a figure** | In code (`platform-metrics.ts`), not in the schema — the same division `OFFER_HOURS_METRICS` follows. The database's job is that a figure exists and has a unit; which boxes a screen asks for changes with a screen. |
| **Entry screens** | `platformMetrics` — this kind's set, in its order and its words, **plus anything the month already holds**, so a kind corrected leaves nothing stranded. |
| **Report pages and the PDF** | `platformOrdered` — reorders and renames, filters nothing. They already drop every figure that is null, so a month shows what it HOLDS. |
| **Published months** | The kind is **frozen into the carried snapshot** beside the offer price, absent ≠ null. Social Media's rates are worked out from different figures per kind and a calc is recomputed on every read, so without this, correcting a kind would move a number on a report already sent. Deliberately not a lock on the kind: that would trap a client who picked "Other" by mistake. |
| **Charts** | A general chart is kept only where the kind is asked for every figure it draws, so LinkedIn no longer shows a save rate; each of the four new kinds has charts of its own, and YouTube's "Subscribers over time" replaces the follower line rather than sitting beside it. |
| **Targets** | A platform is offered only the figures its kind asks for, in its own words. A target already set stays on the list whatever the set says. |
| **The Overview** | Reads **Subscribers** when the main platform is a channel, from the main platform's own figure — never a sum. |
| **"Still to fill in"** | A core figure is owed only by the platforms whose kind asks for it; a figure no platform is asked for is not in the total at all. |
| **No platform row yet** | Instagram, not "no kind said" (§5.2 "Instagram first"): the first save creates the row, so the boxes must not change shape when somebody presses Save. |

### Two things that could not be done the obvious way

- **Two click-through rates.** YouTube's is typed and LinkedIn's and
  Facebook's are worked out. `input_type` belongs to the metric rather than
  the kind, and the database refuses a stored value for a `calc`, so one
  key would be unstorable on the platform that reports it or uncomputable
  on the ones that do not. One on-screen label, never both on a screen.
- **No `minutes` unit.** Average view duration and watch time per view
  wear `ratio`, which already means "one decimal, no symbol, averaged over
  the year rather than summed" — right for a per-view average — and the
  unit is in the label, as Nina's own table writes "Watch time (hours)".

### What came back on step 2 (Dom, 18 November)

Reviewed and approved, with six things to put right first. Five were
code and are in the same commits as the step; the sixth was a question
about the migration and the answer was that there was nothing to fix.

| | |
|---|---|
| **Sort orders** | Live's highest `social_media` sort order is 22, over 22 rows, so the new figures at 23–40 cannot collide with the unique `(category, sort_order)`. Nothing renumbered. |
| **The year grid** | "Impressions per post: 3,156 TOTAL" — a figure that is already a division cannot be added up over twelve months. `PER_UNIT_METRICS` in `year-table.ts`, a named list beside `LEVEL_METRICS`, and it is not only Social Media's four: cost per lead, CPM, CPC, revenue per visitor, average order value and the effective hourly rate were all being summed. A schema test fails on any NEW metric whose formula divides and whose unit totals. |
| **The console** | The "1 Issue" badge on the LinkedIn screenshot was Next's dev advice to preload the header photograph, which the project declined on purpose and has a test for. The sweep that chased it found a real one next door: the PDF keyed its Wins and Focus lists on the TEMPLATE's name, so two figures that both rose shared a React key. Every browser test now fails on a console error (`e2e/quiet.ts`). |
| **The file card** | A Meta export cannot fill one LinkedIn box, so `uploadFor` asks the kind and the card is not drawn on a platform that cannot take one. `looksLikeMeta`, the last place in the product that read meaning out of a platform's name, is gone — which is what §5.2 argued the kind was for. |
| **The note** | "Notes from your strategist", matching the signature Nina settled on 16 November and the mock-ups. Only the heading: "your Allegro team" stays everywhere it is the team being described. |
| **Saves** | Added to the general set — see "Other" above. |

### Still to do on this item

Post types per platform (a LinkedIn post cannot be a Reel), demo data so
each platform shows its own figures, and screenshots of Social Media on
every platform. The demo platforms carry their kinds from 18 November,
so a re-seed no longer puts four kindless rows back.
