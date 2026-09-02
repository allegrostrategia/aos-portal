import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_QUESTIONS } from "@/lib/onboarding/audit-questions";
import { buildItinerary } from "@/lib/onboarding/cadence";
import type { Member } from "@/lib/supabase/types";
import { Badge, Card, Eyebrow, PageHeader, Stat } from "@/components/ui/card";
import { StatusActions } from "./status-actions";
import { RoadmapEditor, type EditorPhase } from "./roadmap-editor";
import { getMemberBuilds } from "@/lib/hours/queries";
import { formatHours } from "@/lib/hours/milestones";
import { AddBuildForm, RateControls } from "./build-forms";

export const metadata: Metadata = {
  title: "Member — aOS admin",
};

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const WEEK = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

type AuditRow = {
  id: string;
  occasion: string;
  submitted_at: string | null;
  answers: Record<string, string>;
  scores: { station?: Record<string, number>; bucket?: Record<string, number> };
  weakest_station_slug: string | null;
  weakest_bucket: string | null;
};

/**
 * §1: "Needs an admin-accessible view — Nina/team can see submitted data per
 * client." This is the prep sheet for the 1:1 — the answers as given, the
 * diagnosis they produce, and the dates the member has been told to expect.
 */
export default async function AdminMemberPage({
  params,
}: PageProps<"/admin/members/[id]">) {
  await requireAdmin();
  const { id } = await params;

  const supabase = await createClient();

  const [
    { data: memberRow },
    { data: auditRows },
    { data: stationRows },
    { data: roadmapRow },
    { data: pastHotSeat },
  ] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("member_audits")
      .select("*")
      .eq("member_id", id)
      .order("submitted_at", { ascending: false, nullsFirst: false }),
    supabase.from("stations").select("slug, name").order("sort_order"),
    supabase
      .from("roadmap")
      .select("phases, current_focus, current_focus_station_slug, confirmed_at")
      .eq("member_id", id)
      .eq("is_current", true)
      .maybeSingle(),
    supabase
      .from("hot_seat_submissions")
      .select("id")
      .eq("member_id", id)
      .not("confirmed_at", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);

  const member = memberRow as Member | null;
  if (!member) notFound();

  const audits = (auditRows ?? []) as AuditRow[];
  const stationName = Object.fromEntries(
    ((stationRows ?? []) as { slug: string; name: string }[]).map((s) => [
      s.slug,
      s.name,
    ]),
  );

  const roadmap = roadmapRow as {
    phases: { title?: string; station_slug?: string | null; items?: { label?: string }[] }[];
    current_focus: string | null;
    current_focus_station_slug: string | null;
    confirmed_at: string | null;
  } | null;

  const editorPhases: EditorPhase[] = (roadmap?.phases ?? []).map((phase) => ({
    title: phase.title ?? "",
    stationSlug: phase.station_slug ?? null,
    items: (phase.items ?? []).map((item) => item.label ?? "").filter(Boolean),
  }));

  const stations = (stationRows ?? []) as { slug: string; name: string }[];

  const itinerary = member.onboarding_start_date
    ? buildItinerary(member.onboarding_start_date)
    : null;

  const builds = await getMemberBuilds(id);
  const today = new Date().toISOString().slice(0, 10);
  const weeklyRate = builds.reduce(
    (sum, build) => sum + (build.current?.hours_per_week ?? 0),
    0,
  );

  return (
    <main className="flex-1 py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href="/admin/members"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← All members
        </Link>
      </p>

      <PageHeader
        eyebrow="Admin"
        title={member.full_name}
        intro={member.email}
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Card>
          <Eyebrow>Status</Eyebrow>
          <p className="mt-2 text-body text-navy">
            {member.status}
            {member.role === "admin" ? (
              <span className="ml-2">
                <Badge tone="gold">Admin</Badge>
              </span>
            ) : null}
          </p>
        </Card>
        <Card>
          <Stat
            label="Joined"
            value={DATE.format(new Date(member.join_date))}
            detail={
              member.contract_term_end_date
                ? `Term ends ${DATE.format(new Date(member.contract_term_end_date))}`
                : "No contract term — hand-seeded row"
            }
          />
        </Card>
        <Card>
          <Eyebrow>Confirmations</Eyebrow>
          <p className="mt-2 text-small text-navy/80">
            Payment: {member.payment_confirmed_at ? "✓" : "—"}
            <br />
            Contract: {member.contract_signed_at ? "✓" : "—"}
            <br />
            Welcome session: {member.welcome_session_watched_at ? "✓" : "—"}
          </p>
        </Card>
      </div>

      {itinerary ? (
        <Card className="mt-5">
          <Eyebrow>Their itinerary — what they&rsquo;ve been told to expect</Eyebrow>
          <ul className="font-mono mt-3 flex flex-wrap gap-x-8 gap-y-2 text-small text-navy/80">
            <li>Tracking I · w/c {WEEK.format(new Date(itinerary.trackingWeekOne))}</li>
            <li>Tracking II · w/c {WEEK.format(new Date(itinerary.trackingWeekTwo))}</li>
            <li>1:1 · w/c {WEEK.format(new Date(itinerary.oneToOneWeek))}</li>
            <li>Hot seat · w/c {WEEK.format(new Date(itinerary.firstHotSeatWeek))}</li>
          </ul>
          {itinerary.joinedOffCycle ? (
            <p className="mt-3 text-small text-orange">
              Joined outside week 2 — these dates were shown to them as
              indicative.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="mt-5">
        <StatusActions
          memberId={member.id}
          memberName={member.full_name}
          status={member.status}
        />
      </div>

      <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
        Roadmap
      </h2>
      <p className="mb-3 text-small text-navy/70">
        {roadmap
          ? roadmap.confirmed_at
            ? "Published — this is what they see on Piazza and in their weekly log."
            : "Draft — not visible to them yet."
          : "No roadmap yet. This is what comes out of the week-four 1:1."}
      </p>
      <RoadmapEditor
        memberId={member.id}
        memberName={member.full_name}
        memberEmail={member.email}
        stations={stations}
        initialPhases={editorPhases}
        initialFocus={roadmap?.current_focus ?? ""}
        initialFocusStation={roadmap?.current_focus_station_slug ?? ""}
        isPublished={Boolean(roadmap?.confirmed_at)}
        hasHadHotSeat={Boolean(pastHotSeat)}
      />

      <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
        Audits
      </h2>

      {audits.length === 0 ? (
        <Card>
          <p className="text-small text-navy/70">Nothing submitted yet.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {audits.map((audit) => (
            <Card key={audit.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <Eyebrow tone="accent">{audit.occasion}</Eyebrow>
                <p className="font-mono text-caption text-navy/50">
                  {audit.submitted_at
                    ? DATE.format(new Date(audit.submitted_at))
                    : "in progress"}
                </p>
              </div>

              <p className="mt-3 text-body text-navy">
                Weakest:{" "}
                <strong className="font-medium">
                  {audit.weakest_station_slug
                    ? (stationName[audit.weakest_station_slug] ??
                      audit.weakest_station_slug)
                    : "—"}
                </strong>
                {audit.weakest_bucket ? (
                  <span className="text-navy/60">
                    {" "}
                    · {audit.weakest_bucket.replace("_", " & ")}
                  </span>
                ) : null}
              </p>

              <ul className="mt-4 flex flex-col gap-3">
                {AUDIT_QUESTIONS.map((question) => {
                  const answer = audit.answers?.[question.id];
                  const option = question.options.find(
                    (o) => o.value === answer,
                  );

                  return (
                    <li
                      key={question.id}
                      className="border-t border-navy/10 pt-3 first:border-t-0 first:pt-0"
                    >
                      <p className="text-small text-navy/60">
                        {stationName[question.stationSlug] ?? question.stationSlug}{" "}
                        — {question.prompt}
                      </p>
                      <p className="mt-1 text-small text-navy">
                        {option ? option.label : "—"}
                        {option ? (
                          <span className="font-mono ml-2 text-caption text-navy/50">
                            {option.score}/3
                          </span>
                        ) : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <h2 className="font-display mt-8 mb-3 text-heading text-navy italic">
        Builds and what they&rsquo;re worth
      </h2>

      {/* The rate half of the hours-reclaimed ledger (§2). Adding a build here
          is a small piece of Step 9's territory, built because Step 10 cannot
          function without it — nothing accrues until a build with a rate
          exists. The handover pack proper is still Step 9. */}
      <Card>
        <p className="text-small text-navy/70">
          {weeklyRate > 0 ? (
            <>
              Currently earning{" "}
              <span className="font-mono text-navy">{formatHours(weeklyRate)} hrs</span>{" "}
              in every qualifying week — ten hours logged and the log submitted.
            </>
          ) : (
            "Nothing earning yet. A build starts adding hours from the first qualifying week after its start date."
          )}
        </p>
      </Card>

      <Card className="mt-4">
        <Eyebrow>Add a build</Eyebrow>
        <div className="mt-3">
          <AddBuildForm memberId={id} today={today} />
        </div>
      </Card>

      {builds.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-4">
          {builds.map((build) => (
            <Card as="li" key={build.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-medium text-navy">{build.title}</p>
                {build.current ? (
                  <span className="font-mono text-small text-navy">
                    {formatHours(build.current.hours_per_week)} hrs/week
                  </span>
                ) : (
                  <span className="text-caption text-navy/50">Retired</span>
                )}
              </div>

              {build.rates.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {build.rates.map((rate) => (
                    <li
                      key={rate.id}
                      className="flex items-baseline justify-between gap-3 text-caption text-navy/60"
                    >
                      <span>
                        {rate.effective_from} →{" "}
                        {rate.effective_until ?? "still running"}
                      </span>
                      <span className="font-mono">
                        {formatHours(rate.hours_per_week)} hrs
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <RateControls
                packId={build.id}
                today={today}
                isRunning={Boolean(build.current)}
              />
            </Card>
          ))}
        </ul>
      ) : null}

    </main>
  );
}
