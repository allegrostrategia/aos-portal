import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import {
  FORMAT_LABEL,
  JOB_LABEL,
  KIND_LABEL,
  getAllContent,
} from "@/lib/library/queries";
import { Badge, Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { ContentForm } from "./content-form";

export const metadata: Metadata = { title: "Library — aOS admin" };

export default async function AdminLibraryPage() {
  await requireAdmin();

  const supabase = await createClient();
  const [{ data: stationRows }, content] = await Promise.all([
    supabase.from("stations").select("slug, name").order("sort_order"),
    getAllContent(),
  ]);

  const stations = (stationRows ?? []) as { slug: string; name: string }[];
  const stationName = Object.fromEntries(stations.map((s) => [s.slug, s.name]));

  const byStation = content.reduce<Record<string, typeof content>>(
    (groups, item) => {
      (groups[item.station_slug] ??= []).push(item);
      return groups;
    },
    {},
  );

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Library"
        intro="Every training lives in exactly one station. The bucket and job tags are secondary — they feed the recommendation engine, they aren't how anyone browses."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <section>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            Add content
          </h2>
          <ContentForm stations={stations} />
        </section>

        <section>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            In the library ({content.length})
          </h2>

          {content.length === 0 ? (
            <Card>
              <p className="text-small text-navy/70">
                Nothing yet. The full content list and its station mapping is in
                Training_Library_Grouping.md.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(byStation).map(([slug, items]) => (
                <div key={slug}>
                  <Eyebrow>{stationName[slug] ?? slug}</Eyebrow>
                  <ul className="mt-2 flex flex-col gap-2">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-navy/10 bg-white/60 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                          <p className="font-medium text-navy">
                            {item.is_hot_seat_buildable ? "★ " : ""}
                            {item.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={item.kind === "training" ? "neutral" : "sky"}>
                              {KIND_LABEL[item.kind]}
                            </Badge>
                            <Badge>{FORMAT_LABEL[item.format]}</Badge>
                            {item.job ? <Badge tone="gold">{JOB_LABEL[item.job]}</Badge> : null}
                          </div>
                        </div>
                        <p className="mt-1 text-caption text-navy/50">
                          {item.published_at ? "Published" : "Draft"}
                          {item.available_during_onboarding
                            ? " · in the onboarding set"
                            : ""}
                          {item.bucket ? ` · ${item.bucket.replace("_", " & ")}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
