import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { stationCategory } from "@/lib/stations/categories";
import { Card, NumberedRow, PageHeader } from "@/components/ui/card";
import { LaStradaMap } from "@/components/map/la-strada-map";
import { getVisitedStations } from "@/lib/map/queries";

export const metadata: Metadata = {
  title: "La Strada · aOS",
};

/**
 * La Strada — the map, and the same eleven stations as a list.
 *
 * Opens to the map, because that is the thing worth showing off (§3, and the
 * redesign brief). A toggle switches to the flat list — L'Editoriale's "04 All
 * Stations": thumbnail, name, what it's about, in the numbered-row style.
 *
 * The toggle is a query parameter rather than client state, so both views are
 * a URL somebody can be sent to, the back button works between them, and the
 * list needs no JavaScript at all. This is also where the "Library" lives now:
 * the brief took its nav slot away and put the browsable list here instead.
 *
 * Access follows §3: free-roam is gated to active status, because an onboarding
 * member has no roadmap yet and so nothing to browse against. They still see
 * the stations, greyed — the same reasoning as the trailer replays in §1, where
 * the quiet onboarding weeks should show proof of what's coming rather than
 * nothing. Grand Hotel Riposo stays open throughout: it's where onboarding
 * happens.
 */
export default async function StationsPage({
  searchParams,
}: PageProps<"/stations">) {
  const member = await requireMember();
  const { view } = await searchParams;
  const listView = view === "list";

  const supabase = await createClient();
  const { data } = await supabase
    .from("stations")
    .select("slug, name, description, sort_order")
    .order("sort_order");

  const stations = (data ?? []) as {
    slug: string;
    name: string;
    description: string | null;
    sort_order: number;
  }[];
  const isActive = member.status === "active";
  const visited = await getVisitedStations(member.id);

  const open = (slug: string) => isActive || slug === "grand-hotel-riposo";

  return (
    <main className="flex-1 py-6 sm:py-10">
      <PageHeader
        title={listView ? "The stations" : "La Strada"}
        tagline={listView ? "Explore. Learn. Implement." : "Your journey. Your pace."}
        intro="All trainings and resources live here. Eleven stations, each its own room."
        actions={<ViewToggle listView={listView} />}
      />

      {listView ? (
        <Card padded={false}>
          <ol className="divide-y divide-ink/6 p-2">
            {stations.map((station) => {
              const thumb = (
                <span className="relative block size-14 overflow-hidden rounded-xl bg-cream-deep">
                  <Image
                    src={`/stations/${station.slug}.jpg`}
                    alt=""
                    fill
                    sizes="56px"
                    className={`object-cover ${open(station.slug) ? "" : "opacity-60 grayscale"}`}
                  />
                </span>
              );
              const meta = (
                <>
                  {stationCategory(station.slug)}
                  {visited.has(station.slug) ? (
                    <span className="text-orange"> · Visited</span>
                  ) : null}
                </>
              );
              return (
                <NumberedRow
                  key={station.slug}
                  leading={thumb}
                  title={station.name}
                  meta={meta}
                  href={open(station.slug) ? `/stations/${station.slug}` : undefined}
                  className={open(station.slug) ? "" : "opacity-70"}
                />
              );
            })}
          </ol>
        </Card>
      ) : (
        <LaStradaMap
          locked={!isActive}
          stations={stations.map((station) => ({
            slug: station.slug,
            name: station.name,
            // The badge number on the map. From `stations.sort_order`, so the
            // numbering has one source rather than a second list in the map
            // config that could quietly disagree with the seeded order.
            number: station.sort_order,
            visited: visited.has(station.slug),
          }))}
        />
      )}
    </main>
  );
}

/**
 * Map / list, as two links. The burger is the reference's icon for the list;
 * the map pin is its counterpart. `aria-current` marks the active one so a
 * screen reader hears which view it's on rather than two identical links.
 */
function ViewToggle({ listView }: { listView: boolean }) {
  const base =
    "flex size-10 items-center justify-center rounded-full border transition";
  return (
    <div className="flex gap-2" role="group" aria-label="View">
      <Link
        href="/stations"
        aria-label="Map view"
        aria-current={listView ? undefined : "true"}
        className={`${base} ${listView ? "border-ink/15 bg-card text-ink/60 hover:text-ink" : "border-ink bg-ink text-cream"}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10Z" />
          <circle cx="12" cy="11" r="2.25" />
        </svg>
      </Link>
      <Link
        href="/stations?view=list"
        aria-label="List view"
        aria-current={listView ? "true" : undefined}
        className={`${base} ${listView ? "border-ink bg-ink text-cream" : "border-ink/15 bg-card text-ink/60 hover:text-ink"}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </Link>
    </div>
  );
}
