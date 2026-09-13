import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { StationShell } from "@/components/station-shell";
import { ContentList } from "@/components/content-list";
import { ButtonLink } from "@/components/ui/button";
import { getCompletedContentIds, getStationContent } from "@/lib/library/queries";
import { recordStationVisit } from "@/lib/map/actions";

type Station = {
  slug: string;
  name: string;
  description: string | null;
  holds_training_content: boolean;
};

async function getStation(slug: string): Promise<Station | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("stations")
    .select("slug, name, description, holds_training_content")
    .eq("slug", slug)
    .maybeSingle();

  return (data as Station | null) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps<"/stations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const station = await getStation(slug);

  return { title: station ? `${station.name} — aOS` : "Station — aOS" };
}

/**
 * A single station.
 *
 * The skeleton is fixed by StationShell (§11). What fills it comes from later
 * steps — recommended training is Step 7, current priority comes from the
 * roadmap in Step 4 — so the slots those will occupy are left empty for now
 * rather than filled with invented content. StationShell omits empty slots, so
 * the page reads as unfinished rather than broken.
 */
export default async function StationPage({
  params,
}: PageProps<"/stations/[slug]">) {
  const member = await requireMember();

  const { slug } = await params;
  const station = await getStation(slug);

  if (!station) notFound();

  // RLS tiers this: an onboarding member gets the starter set and trailer
  // replays, an active member gets everything published (§1, §6). The
  // completions are the member's own ticks, for the list's marks and the
  // "Continue learning" target.
  const [content, completed] = await Promise.all([
    getStationContent(slug),
    getCompletedContentIds(member.id),
  ]);

  // Marks the map. Not awaited into anything the page renders — a lost tally is
  // better than a station that fails to open.
  await recordStationVisit(slug);

  const lessons = content.filter(
    (i) => i.kind === "training" && (i.format === "video" || i.format === "audio"),
  );
  const done = lessons.filter((i) => completed.has(i.id)).length;
  // The first lesson not yet ticked, in the room's order — where "continue"
  // goes. Falls back to the first lesson once everything is done, so the pill
  // always leads somewhere.
  const next = lessons.find((i) => !completed.has(i.id)) ?? lessons[0];

  return (
    <StationShell
      station={station}
      cta={
        next ? (
          <ButtonLink href={`/library/${next.slug}`} variant="primary" size="lg">
            {done === 0 ? "Start learning" : done < lessons.length ? "Continue learning" : "Revisit the lessons"}
            <span aria-hidden>→</span>
          </ButtonLink>
        ) : undefined
      }
      content={
        station.holds_training_content ? (
          <ContentList items={content} completed={completed} />
        ) : (
          <p className="text-body text-ink/70">
            {station.name} holds no formal training content — it&rsquo;s a place
            rather than a library.
          </p>
        )
      }
      progress={
        lessons.length > 0 ? (
          <p className="text-body text-ink/80">
            <span className="font-mono">{done}</span> of{" "}
            <span className="font-mono">{lessons.length}</span> lessons marked
            complete.
          </p>
        ) : undefined
      }
    />
  );
}
