# Assets

Filenames here are **load-bearing**. Station images are looked up by the station's
`slug` from the database — `/stations/${station.slug}.webp` — so there is no
mapping table to keep in sync, and a typo shows up as a missing image rather than
as a wrong one. Slugs come from `supabase/migrations/…_reference_data.sql`.

## Stations — `public/stations/`

One file per station, named exactly for its slug:

```
grand-hotel-riposo.webp     Onboarding and the audit
studio-dell-architetto.webp Systems & Delivery
officina-vespa.webp         Automation
cinema-allegro.webp         Visibility, replays, Nina's audio drop
piazza-caffe.webp           Leads & Nurture          ← no accent: piazza-caffe
la-boutique.webp            Offers & Pricing
banco-allegro.webp          Data & Money
stazione-centrale.webp      Launches
terrazza.webp               In-Person & Events
club-allegro.webp           Membership Design
archivio.webp               The member's own project archive
```

Eleven files, all lowercase, hyphens not spaces or underscores. Two easy slips:
**`piazza-caffe`** has no accent on the e, and **`studio-dell-architetto`** has no
apostrophe.

**Format and size.** WebP preferred, PNG or JPG fine — if yours are PNG or JPG,
keep the extension consistent across all eleven and tell me, and I'll set the
components to match. Supply one large source per station at roughly **1600×1000
(16:10)**; Next.js generates the smaller responsive sizes at build time, so
there's no need for @2x variants or per-breakpoint crops. Same aspect ratio
across all eleven matters more than the exact pixel count — they sit next to each
other in a grid, and mixed ratios make the cards ragged.

## Brand — `public/brand/`

```
aos-mark.svg          The aOS mark. SVG, so it stays crisp at every size.
aos-wordmark.svg      Optional, if the mark and wordmark are separate lockups.
```

SVG strongly preferred here. If you only have raster, `aos-mark.png` at 1024px
square works.

## Illustrations — `public/illustrations/`

The coastline art and any decorative pieces. No naming rule — these get referenced
individually, so descriptive names are fine (`coastline.svg`, `vespa.svg`).

## Favicon and social preview — these live in `src/app/`, not here

Next.js picks these up by filename automatically; nothing needs importing. Note
the file type restrictions — they're enforced by the framework:

```
src/app/icon.svg              Browser tab icon. .svg, .png, .jpg or .ico
src/app/apple-icon.png        iOS home screen, 180×180. PNG or JPG only — no SVG
src/app/opengraph-image.png   Link preview, 1200×630. PNG, JPG or GIF — no SVG
```

There's currently a `src/app/favicon.ico` left over from the scaffold. Adding
`icon.svg` alongside it is fine — browsers prefer the SVG — but delete the
scaffold one when the real mark lands, or the old Next.js logo will keep
appearing in some browsers.
