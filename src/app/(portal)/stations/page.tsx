import type { Metadata } from "next";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { StationCard, type StationCardStation } from "@/components/station-card";

export const metadata: Metadata = {
  title: "Stations — aOS",
};

/**
 * The eleven stations, in map order.
 *
 * Not La Strada — that's the metro map with pan and zoom, and it's Step 4. This
 * is the plain list underneath it, which is what the station artwork needed in
 * order to be wired up at all.
 *
 * Access follows §3: free-roam is gated to active status, because an onboarding
 * member has no roadmap yet and so nothing to browse against. They still see the
 * stations, greyed — the same reasoning as the trailer replays in §1, where the
 * quiet onboarding weeks show proof of what's coming rather than nothing at all.
 * Grand Hotel Riposo stays open throughout: it's where onboarding happens.
 */
export default async function StationsPage() {
  const member = await requireMember();

  const supabase = await createClient();
  const { data } = await supabase
    .from("stations")
    .select("slug, name, description")
    .order("sort_order");

  const stations = (data ?? []) as StationCardStation[];
  const isActive = member.status === "active";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:py-14">
      <p className="font-mono text-xs tracking-widest text-orange uppercase">
        La Strada
      </p>
      <h1 className="font-display mt-2 text-3xl italic text-navy sm:text-4xl">
        The stations
      </h1>
      <p className="mt-3 max-w-xl text-sm text-navy/70">
        {isActive
          ? "Every station is yours to walk, in whatever order suits what you’re building."
          : "Where you’ll be working once you’re active. Grand Hotel Riposo is where onboarding happens — start there."}
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stations.map((station) => (
          <StationCard
            key={station.slug}
            station={station}
            locked={!isActive && station.slug !== "grand-hotel-riposo"}
          />
        ))}
      </div>

      <p className="mt-8 text-sm text-navy/50">
        The full La Strada map, with the route between these, arrives in Step 4.
      </p>
    </main>
  );
}
