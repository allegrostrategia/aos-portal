"use server";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

/**
 * Record that a member walked into a station.
 *
 * Called from the station page's render rather than from a click, because the
 * fact worth recording is "they were in the room" — and arriving by deep link
 * from Piazza's "Continue your journey" is just as much a visit as clicking a
 * marker on the map.
 *
 * Deliberately not awaited by anything the page needs: a visit that fails to
 * record is a lost tally, not a broken page.
 */
export async function recordStationVisit(stationSlug: string): Promise<void> {
  const member = await requireMember();
  if (member.status === "onboarding") return;

  const supabase = await createClient();
  await supabase.rpc("record_station_visit", { p_station_slug: stationSlug });
}
