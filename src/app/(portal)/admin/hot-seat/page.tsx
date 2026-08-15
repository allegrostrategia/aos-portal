import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { formatSessionTimeShort } from "@/lib/time-zone";
import { SessionForm } from "./session-form";

export const metadata: Metadata = {
  title: "Hot seat — aOS admin",
};

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

type SessionRow = {
  id: string;
  session_month: string;
  scheduled_for: string | null;
  zoom_url: string | null;
  hot_seat_submissions: { id: string; submitted_at: string | null; confirmed_at: string | null }[];
};

export default async function AdminHotSeatPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data } = await supabase
    .from("hot_seat_sessions")
    .select("id, session_month, scheduled_for, zoom_url, hot_seat_submissions(id, submitted_at, confirmed_at)")
    .order("session_month", { ascending: false });

  const sessions = (data ?? []) as SessionRow[];
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Hot seat"
        intro="One session a month, week one. Set the time and link when you have them — members can see the session exists either way."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <Card>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            Schedule a session
          </h2>
          <SessionForm defaultMonth={thisMonth} />
        </Card>

        <section>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            Sessions
          </h2>

          {sessions.length === 0 ? (
            <Card>
              <p className="text-small text-navy/70">None scheduled yet.</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {sessions.map((session) => {
                const submitted = session.hot_seat_submissions.filter(
                  (s) => s.submitted_at,
                ).length;
                const confirmed = session.hot_seat_submissions.filter(
                  (s) => s.confirmed_at,
                ).length;

                return (
                  <Card as="li" key={session.id} padded={false}>
                    {/* The whole card is the target, matching the member list.
                        A single underlined heading inside a large card reads as
                        decoration, not as the way through. */}
                    <Link
                      href={`/admin/hot-seat/${session.id}`}
                      className="block p-5 transition hover:bg-white/40 sm:p-6"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <p className="font-display text-heading text-navy italic">
                          {MONTH.format(new Date(session.session_month))}
                        </p>
                        <p className="font-mono text-caption text-navy/60">
                          {submitted} submitted · {confirmed} prepped
                        </p>
                      </div>
                      <p className="mt-1 text-small text-navy/70">
                        {session.scheduled_for
                          ? formatSessionTimeShort(session.scheduled_for)
                          : "Time not set"}
                        {session.zoom_url ? " · link set" : " · no link yet"}
                      </p>
                      <p className="mt-3 text-small text-navy underline decoration-orange decoration-2 underline-offset-4">
                        {submitted > confirmed
                          ? `Prep ${submitted - confirmed} submission${submitted - confirmed === 1 ? "" : "s"} →`
                          : "Open prep sheet →"}
                      </p>
                    </Link>
                  </Card>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <Card className="mt-8">
        <Eyebrow>Still to come</Eyebrow>
        <p className="mt-2 text-small text-navy/70">
          Reviewing and confirming each member&rsquo;s challenge — with Claude
          drafting a suggestion from their tracked time — is the next piece.
          Submissions are being collected in the meantime.
        </p>
      </Card>
    </main>
  );
}
