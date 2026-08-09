import type { Metadata } from "next";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { StationCard, type StationCardStation } from "@/components/station-card";
import { PageHeader } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "La Strada — aOS",
};

/**
 * The eleven stations, in map order.
 *
 * Not La Strada proper — the metro map with pan and zoom is Step 4. This is the
 * list underneath it.
 *
 * Access follows §3: free-roam is gated to active status, because an onboarding
 * member has no roadmap yet and so nothing to browse against. They still see the
 * stations, greyed — the same reasoning as the trailer replays in §1, where the
 * quiet onboarding weeks should show proof of what's coming rather than nothing.
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
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="La Strada"
        title="The stations"
        intro={
          isActive
            ? "Every station is yours to walk, in whatever order suits what you’re building."
            : "Where you’ll be working once you’re active. Grand Hotel Riposo is where onboarding happens — start there."
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stations.map((station) => (
          <StationCard
            key={station.slug}
            station={station}
            locked={!isActive && station.slug !== "grand-hotel-riposo"}
          />
        ))}
      </div>

      <p className="mt-8 text-small text-navy/50">
        The full map, with the route between these, arrives in Step 4.
      </p>
    </main>
  );
}
