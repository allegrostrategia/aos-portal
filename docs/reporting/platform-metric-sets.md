# Social Media: a figure set per platform

**For Nina to confirm before anything is built.** 15 November 2026.

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
- **Nothing already entered is lost.** Figures are already stored per
  platform; this only changes which boxes are *shown*. A figure that
  stops being asked for stays in the database and keeps appearing on the
  months it was entered for (rule 7).

**Question for Nina:** is five kinds enough — Instagram, LinkedIn,
TikTok, YouTube, Other — or should Facebook and Pinterest be their own?

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

**Post types:** Text · Image · Document / carousel · Video · Poll · Article

**What changes from today:** reach becomes **impressions** and **members
reached** — LinkedIn reports both and they are different numbers.
Likes + comments splits into **reactions** and **comments**, because
LinkedIn counts them separately. **Saves and shares are gone**; reposts
replaces shares. Engagement rate is measured against impressions, which
is how LinkedIn reports it.

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

**One question.** Click-through rate and average view duration are both
*given* to you by YouTube Studio, and both can also be worked out
(CTR = views ÷ impressions; average duration = watch time ÷ views). If
we ask for them, the typed number and the worked-out one can disagree
on the same screen. **Recommendation: type the two YouTube gives you,
and do not draw the worked-out versions** — YouTube counts a view
differently from an impression-click and its own number is the one
Nina would quote. Needs Nina's yes.

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

## What I need back

1. The four sets above — anything missing, anything to drop.
2. Five kinds, or more?
3. YouTube: type CTR and average view duration, or work them out?
4. Should LinkedIn also carry DMs, the way Instagram does? It is where
   a lot of service-business conversations actually start.
