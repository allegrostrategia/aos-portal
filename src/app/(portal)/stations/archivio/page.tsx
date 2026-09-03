import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { recordStationVisit } from "@/lib/map/actions";
import { getArchivio } from "@/lib/sop/queries";
import { isComplete, missingFrom } from "@/lib/sop/template";
import { StationShell } from "@/components/station-shell";
import { Badge, Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Archivio — aOS" };

/**
 * Archivio (§8): the member's own projects, not training content about them.
 *
 * A real station on the map, and the one that holds nothing from the library —
 * `stations.holds_training_content` is already false for it. This route shadows
 * `/stations/[slug]` for that one slug, so the marker still leads here and the
 * visit is still recorded.
 *
 * Two sources in one list, because to the person reading it they're the same
 * thing — this is what I've built. What Nina wrote up from a hot seat build is
 * hers to write and theirs to keep; what they documented themselves is theirs
 * outright.
 */
export default async function ArchivioPage() {
  const member = (await getCurrentMember())!;

  const supabase = await createClient();
  const { data: stationRow } = await supabase
    .from("stations")
    .select("slug, name, description")
    .eq("slug", "archivio")
    .maybeSingle();

  await recordStationVisit("archivio");

  const entries = await getArchivio(member.id);
  const station = (stationRow as {
    slug: string;
    name: string;
    description: string | null;
  } | null) ?? { slug: "archivio", name: "Archivio", description: null };

  return (
    <StationShell
      station={station}
      whyThisMatters={
        <p>
          Everything you&rsquo;ve actually built. Live builds from the hot seat
          get written up here, and you can document anything else you run — the
          processes in your head that nobody else could pick up. These are the
          only things in aOS you can take out with you.
        </p>
      }
      buildAction={
        <ButtonLink href="/stations/archivio/new">Document something</ButtonLink>
      }
      recommendedTraining={
        entries.length === 0 ? (
          <Card>
            <p className="text-small text-navy/70">
              Nothing here yet. Your first hot seat build lands here
              automatically — and anything you run that only exists in your head
              is worth writing down before it has to be explained in a hurry.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => {
              const sop = entry.sop;
              const missing = sop ? missingFrom(sop) : [];

              return (
                <Card as="li" key={entry.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <Link
                      href={`/stations/archivio/${entry.id}`}
                      className="text-body font-medium text-navy underline decoration-orange decoration-2 underline-offset-4"
                    >
                      {entry.title}
                    </Link>
                    <Badge tone={entry.source === "member_sop" ? "sky" : "gold"}>
                      {entry.source === "member_sop" ? "Your SOP" : "Built together"}
                    </Badge>
                  </div>

                  {sop && !isComplete(sop) ? (
                    <p className="mt-1 text-caption text-navy/60">
                      Still to add: {missing.join(", ")}.
                    </p>
                  ) : null}

                  {sop && isComplete(sop) ? (
                    <p className="mt-1 text-caption text-navy/50">
                      {sop.steps.length}{" "}
                      {sop.steps.length === 1 ? "step" : "steps"} · ready to hand
                      over
                    </p>
                  ) : null}
                </Card>
              );
            })}
          </ul>
        )
      }
    />
  );
}
