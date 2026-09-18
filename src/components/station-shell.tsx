import Image from "next/image";
import Link from "next/link";

import { stationCategory } from "@/lib/stations/categories";
import { Card, Eyebrow, Quote } from "@/components/ui/card";

/**
 * The shared station skeleton (§11).
 *
 * "Every station follows the same underlying layout regardless of theme: where
 * you are, why this matters, current priority, recommended training,
 * build/action, progress, return to La Strada. The theme changes, the skeleton
 * never does."
 *
 * So the sections are fixed here as named slots rather than left to each station
 * page to arrange. A station that wants a different order doesn't get one — that
 * is the point of the rule, and the reason it's expressed as a component instead
 * of a convention people are asked to remember.
 *
 * L'Editoriale (13 Sep) restyles the slots, not the order. "Where you are" is
 * the photo banner with the name and its subject line; "why this matters" is
 * the station's description set as an editorial pull-quote — the field already
 * existed, it just never had the visual weight the reference gives it. The
 * content sits directly on the page rather than inside a card, because a
 * numbered list is its own surface.
 *
 * Slots left empty are omitted rather than rendered hollow: an empty "current
 * priority" heading tells a member less than no heading at all.
 */
export function StationShell({
  station,
  currentPriority,
  content,
  buildAction,
  progress,
  cta,
}: {
  station: { slug: string; name: string; description: string | null };
  currentPriority?: React.ReactNode;
  /** The three sections — lessons, tools, replays. */
  content?: React.ReactNode;
  buildAction?: React.ReactNode;
  progress?: React.ReactNode;
  /** The orange "Continue learning" pill, when there is somewhere to continue to. */
  cta?: React.ReactNode;
}) {
  const category = stationCategory(station.slug);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 py-6 sm:py-10">
      {/* 1. Where you are */}
      <header>
        <div className="mb-5">
          <p className="mb-3">
            <Link
              href="/stations"
              className="text-small text-ink/60 transition hover:text-ink"
            >
              ← The Map
            </Link>
          </p>
          <h1 className="font-display text-display font-medium text-ink">
            {station.name}
          </h1>
          {category ? <Eyebrow className="mt-3">{category}</Eyebrow> : null}
        </div>

        <div className="relative aspect-4/3 w-full overflow-hidden rounded-card bg-cream-deep shadow-soft sm:aspect-[21/10]">
          <Image
            src={`/stations/${station.slug}.jpg`}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 48rem, 100vw"
            className="object-cover"
          />
        </div>
      </header>

      {/* 2. Why this matters — the description, given the weight the reference
          gives it. */}
      {station.description ? (
        <Quote className="mt-8 max-w-2xl text-[1.35rem] leading-snug">
          {station.description}
        </Quote>
      ) : null}

      {cta ? <div className="mt-6">{cta}</div> : null}

      {/* 3. Current priority */}
      {currentPriority ? (
        <Card className="mt-8">
          <Eyebrow>Your current priority</Eyebrow>
          <div className="mt-3 text-body text-ink/80">{currentPriority}</div>
        </Card>
      ) : null}

      {/* 4. Recommended training — §11's slot, filled with everything in the
          room, grouped. "Recommended for you" proper is a Piazza card (§6), so
          calling a complete list that here would be a promise this doesn't
          keep yet. Ordering by the diagnostic comes later. */}
      {content ? <div className="mt-10">{content}</div> : null}

      {/* 5. Build / action */}
      {buildAction ? (
        <Card className="mt-8">
          <Eyebrow>Build something</Eyebrow>
          <div className="mt-3">{buildAction}</div>
        </Card>
      ) : null}

      {/* 6. Progress */}
      {progress ? (
        <Card className="mt-8">
          <Eyebrow>Your progress here</Eyebrow>
          <div className="mt-3">{progress}</div>
        </Card>
      ) : null}

      {/* 7. Return to The Map — every station has one, so nobody gets stuck. */}
      <div className="mt-10">
        <Link
          href="/stations"
          className="text-small text-ink/70 underline decoration-orange decoration-2 underline-offset-4 transition hover:text-ink"
        >
          ← Return to The Map
        </Link>
      </div>
    </main>
  );
}
