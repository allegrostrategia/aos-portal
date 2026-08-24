import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { StationShell } from "@/components/station-shell";
import { ContentList } from "@/components/content-list";
import { getStationContent } from "@/lib/library/queries";
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
  await requireMember();

  const { slug } = await params;
  const station = await getStation(slug);

  if (!station) notFound();

  // RLS tiers this: an onboarding member gets the starter set and trailer
  // replays, an active member gets everything published (§1, §6).
  const content = await getStationContent(slug);

  // Marks the map. Not awaited into anything the page renders — a lost tally is
  // better than a station that fails to open.
  await recordStationVisit(slug);

  return (
    <StationShell
      station={station}
      recommendedTraining={
        station.holds_training_content ? <ContentList items={content} /> : undefined
      }
      whyThisMatters={
        station.holds_training_content ? (
          <p>
            The trainings, tools and live builds for {station.name} live here.
            What&rsquo;s surfaced first depends on where your roadmap currently
            points — but everything in this room stays open to you.
          </p>
        ) : (
          <p>
            {station.name} holds no formal training content — it&rsquo;s a place
            rather than a library.
          </p>
        )
      }
    />
  );
}
