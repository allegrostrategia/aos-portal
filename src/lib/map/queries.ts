import "server-only";

import { createClient } from "@/lib/supabase/server";

export type VisitedMap = Set<string>;

/** Which stations this member has walked into. */
export async function getVisitedStations(
  memberId: string,
): Promise<VisitedMap> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("station_visits")
    .select("station_slug")
    .eq("member_id", memberId);

  return new Set(
    ((data ?? []) as { station_slug: string }[]).map((r) => r.station_slug),
  );
}
