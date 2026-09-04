import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import {
  getActionNotes,
  getCurrentRoadmap,
  getTrainingOptions,
} from "@/lib/roadmap/queries";
import { allActions } from "@/lib/roadmap/shape";
import { Badge, Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { RoadmapEditor } from "./roadmap-editor";

export const metadata: Metadata = { title: "Roadmaps — aOS admin" };

/**
 * The Roadmaps section (3 Sep).
 *
 * Its own place rather than a panel buried in the member page, because writing a
 * six-month plan is a sitting-down job and the member page is for everything
 * else about them.
 *
 * Filtered by member through the URL, so a roadmap can be linked to and come
 * back to — and so the list doubles as a view of who has one and who doesn't,
 * which is the question Nina actually arrives with.
 */
export default async function AdminRoadmapsPage({
  searchParams,
}: PageProps<"/admin/roadmaps">) {
  await requireAdmin();
  const params = await searchParams;
  const selectedId = typeof params.member === "string" ? params.member : null;

  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from("members")
    .select("id, full_name, status")
    .eq("role", "member")
    .neq("status", "cancelled")
    .order("full_name");

  const members = (memberRows ?? []) as {
    id: string;
    full_name: string;
    status: string;
  }[];

  const selected = selectedId
    ? (members.find((m) => m.id === selectedId) ?? null)
    : null;

  const roadmap = selected ? await getCurrentRoadmap(selected.id) : null;
  const notes = roadmap ? await getActionNotes(roadmap.id) : new Map<string, string>();
  const trainings = selected ? await getTrainingOptions() : [];

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Roadmaps"
        intro="Six months, month by month. Work the plan out wherever you work it out, then put it here — months hold focuses, focuses hold the actions, and each action points at a training and a week."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Members">
          <Eyebrow>Whose roadmap</Eyebrow>
          <ul className="mt-2 flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.id}>
                <Link
                  href={`/admin/roadmaps?member=${member.id}`}
                  aria-current={member.id === selectedId ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-small transition ${
                    member.id === selectedId
                      ? "bg-white/70 font-medium text-navy"
                      : "text-navy/70 hover:bg-white/40 hover:text-navy"
                  }`}
                >
                  {member.full_name}
                  {member.status === "onboarding" ? (
                    <span className="text-caption text-navy/40"> · onboarding</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          {members.length === 0 ? (
            <p className="mt-2 text-small text-navy/60">
              Nobody to plan for yet.
            </p>
          ) : null}
        </nav>

        <section>
          {!selected ? (
            <Card>
              <p className="text-small text-navy/70">
                Pick somebody. Their roadmap is the self-paced track from the
                1:1 — separate from the hot seat build, which owns their current
                focus through its own prep and confirm.
              </p>
            </Card>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-heading text-navy italic">
                  {selected.full_name}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {roadmap?.confirmedAt ? (
                    <Badge tone="sky">Published</Badge>
                  ) : (
                    <Badge tone="gold">{roadmap ? "Draft" : "Nothing yet"}</Badge>
                  )}
                  {roadmap ? (
                    <span className="text-caption text-navy/50">
                      {allActions(roadmap.months).length} actions
                    </span>
                  ) : null}
                </div>
              </div>

              {roadmap?.currentFocus ? (
                <Card className="mb-4 bg-lemon/25">
                  <Eyebrow>This month&rsquo;s build</Eyebrow>
                  <p className="mt-1 text-small text-navy/80">
                    {roadmap.currentFocus}
                  </p>
                  <p className="mt-1 text-caption text-navy/50">
                    Set through the hot seat&rsquo;s prep and confirm, not here —
                    the roadmap is the self-paced track alongside it.
                  </p>
                </Card>
              ) : null}

              <RoadmapEditor
                memberId={selected.id}
                months={roadmap?.months ?? []}
                trainings={trainings}
                isPublished={Boolean(roadmap?.confirmedAt)}
                notes={notes}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
