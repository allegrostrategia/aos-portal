import Image from "next/image";
import Link from "next/link";

import { Card, Eyebrow } from "@/components/ui/card";

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
 * Slots left empty are omitted rather than rendered hollow: an empty "current
 * priority" heading tells a member less than no heading at all.
 */
export function StationShell({
  station,
  whyThisMatters,
  currentPriority,
  recommendedTraining,
  buildAction,
  progress,
}: {
  station: { slug: string; name: string; description: string | null };
  whyThisMatters?: React.ReactNode;
  currentPriority?: React.ReactNode;
  recommendedTraining?: React.ReactNode;
  buildAction?: React.ReactNode;
  progress?: React.ReactNode;
}) {
  return (
    <main className="flex-1 py-8 sm:py-10">
      {/* 1. Where you are */}
      <header>
        <div className="relative aspect-3/2 w-full overflow-hidden rounded-xl bg-sky/20 sm:aspect-[21/9]">
          <Image
            src={`/stations/${station.slug}.png`}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="object-cover"
          />
        </div>

        <div className="mt-5">
          <Eyebrow tone="accent">La Strada</Eyebrow>
          <h1 className="font-display mt-2 text-display text-navy italic">
            {station.name}
          </h1>
          {station.description ? (
            <p className="mt-3 max-w-2xl text-body text-navy/70">
              {station.description}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {/* 2. Why this matters */}
        {whyThisMatters ? (
          <Card className="lg:col-span-2">
            <Eyebrow>Why this matters</Eyebrow>
            <div className="mt-3 text-body text-navy/80">{whyThisMatters}</div>
          </Card>
        ) : null}

        {/* 3. Current priority */}
        {currentPriority ? (
          <Card>
            <Eyebrow>Your current priority</Eyebrow>
            <div className="mt-3 text-body text-navy/80">{currentPriority}</div>
          </Card>
        ) : null}

        {/* 4. Recommended training — §11's slot, filled for now with everything
            in the room. "Recommended for you" proper is a Piazza card (§6), so
            calling a complete list that here would be a promise this doesn't
            keep yet. Ordering by the diagnostic comes later. */}
        {recommendedTraining ? (
          <Card className="lg:col-span-2">
            <Eyebrow>In this room</Eyebrow>
            <div className="mt-3">{recommendedTraining}</div>
          </Card>
        ) : null}

        {/* 5. Build / action */}
        {buildAction ? (
          <Card>
            <Eyebrow>Build something</Eyebrow>
            <div className="mt-3">{buildAction}</div>
          </Card>
        ) : null}

        {/* 6. Progress */}
        {progress ? (
          <Card className="lg:col-span-3">
            <Eyebrow>Your progress here</Eyebrow>
            <div className="mt-3">{progress}</div>
          </Card>
        ) : null}
      </div>

      {/* 7. Return to La Strada — every station has one, so nobody gets stuck. */}
      <div className="mt-8">
        <Link
          href="/stations"
          className="text-small text-navy/70 underline decoration-orange decoration-2 underline-offset-4 transition hover:text-navy"
        >
          ← Return to La Strada
        </Link>
      </div>
    </main>
  );
}
