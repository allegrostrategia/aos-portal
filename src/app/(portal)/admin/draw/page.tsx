import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Eyebrow, PageHeader, Stat } from "@/components/ui/card";
import { formatCalendarDate, formatCalendarMonth } from "@/lib/time-zone";
import { DrawControls, NewDrawForm } from "./draw-forms";

export const metadata: Metadata = { title: "Draw — aOS admin" };

type DrawRow = {
  id: string;
  draw_month: string;
  prize: string;
  draw_date: string;
  winner_member_id: string | null;
  drawn_at: string | null;
  draw_entries: { member_id: string; complete_weeks: number | null }[];
};

type Eligibility = {
  member_id: string;
  full_name: string;
  complete_weeks: number;
  weeks_required: number;
  is_eligible: boolean;
};

export default async function AdminDrawPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: drawRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from("draws")
      .select("*, draw_entries(member_id, complete_weeks)")
      .order("draw_month", { ascending: false }),
    // Admin RLS returns everyone, so one lookup covers both the entrant lists
    // and the winner's name — a member cannot resolve another member's id, and
    // this page is the only place that needs to.
    supabase.from("members").select("id, full_name"),
  ]);

  const draws = (drawRows ?? []) as DrawRow[];
  const nameById = Object.fromEntries(
    ((memberRows ?? []) as { id: string; full_name: string }[]).map((m) => [
      m.id,
      m.full_name,
    ]),
  );

  // Eligibility is a live count, so it's only worth asking for on draws still
  // open. Once drawn, `complete_weeks` on the entry is the number that counted,
  // and re-deriving it would show a different figure as members log more time.
  const open = draws.filter((d) => !d.drawn_at);
  const eligibility = new Map<string, Eligibility[]>(
    await Promise.all(
      open.map(async (draw) => {
        const { data } = await supabase.rpc("draw_eligibility", {
          p_month: draw.draw_month,
        });
        return [draw.id, (data ?? []) as Eligibility[]] as const;
      }),
    ),
  );

  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Monthly draw"
        intro="Eligibility is earned, not given: every week of the month logged at ten hours or more. Set the draw up whenever, lock the entrants once the month is over, then draw."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <Card>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            Set up a draw
          </h2>
          <NewDrawForm defaultMonth={thisMonth} />
        </Card>

        <section>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            Draws
          </h2>

          {draws.length === 0 ? (
            <Card>
              <p className="text-small text-navy/70">
                None yet. One a month, drawn after the month it rewards.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-4">
              {draws.map((draw) => {
                const entrants = draw.draw_entries.length;
                const rows = eligibility.get(draw.id) ?? [];
                const eligible = rows.filter((r) => r.is_eligible).length;
                const required = rows[0]?.weeks_required;

                return (
                  <Card as="li" key={draw.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <div>
                        <Eyebrow>{formatCalendarMonth(draw.draw_month)}</Eyebrow>
                        <p className="mt-1 text-body font-medium text-navy">
                          {draw.prize}
                        </p>
                      </div>
                      {draw.drawn_at ? (
                        <Badge tone="gold">Drawn</Badge>
                      ) : (
                        <Badge tone="sky">Open</Badge>
                      )}
                    </div>

                    <p className="mt-1 text-caption text-navy/50">
                      Drawn on {formatCalendarDate(draw.draw_date)}
                    </p>

                    {draw.drawn_at ? (
                      <div className="mt-4 rounded-lg border border-gold/50 bg-lemon/25 px-4 py-3">
                        <Eyebrow>Winner</Eyebrow>
                        <p className="mt-1 text-body text-navy">
                          {draw.winner_member_id
                            ? (nameById[draw.winner_member_id] ?? "A former member")
                            : "No winner recorded"}
                        </p>
                        <p className="mt-1 text-caption text-navy/50">
                          From {entrants} {entrants === 1 ? "entrant" : "entrants"}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <Stat
                            label="Entered"
                            value={entrants}
                            detail={
                              entrants === 0
                                ? "Entrant list not locked yet"
                                : "Locked in — this is who's in the hat"
                            }
                          />
                          <Stat
                            label="Eligible now"
                            value={eligible}
                            detail={
                              required
                                ? `${required} complete ${required === 1 ? "week" : "weeks"} needed this month`
                                : "No active members yet"
                            }
                          />
                        </div>

                        {rows.length > 0 ? (
                          <details className="mt-4">
                            <summary className="cursor-pointer list-none text-caption text-navy/60 underline underline-offset-4 transition hover:text-navy">
                              Who&rsquo;s where ({rows.length} active{" "}
                              {rows.length === 1 ? "member" : "members"})
                            </summary>
                            {/* Everyone, not just the ones who cleared the bar:
                                "four of five" is the conversation worth having,
                                and a winners-only list hides it. */}
                            <ul className="mt-2 flex flex-col gap-1">
                              {rows.map((row) => (
                                <li
                                  key={row.member_id}
                                  className="flex items-baseline justify-between gap-3 border-b border-navy/5 py-1.5 last:border-0"
                                >
                                  <span className="text-small text-navy">
                                    {row.full_name}
                                  </span>
                                  <span
                                    className={`font-mono text-caption ${
                                      row.is_eligible ? "text-navy" : "text-navy/40"
                                    }`}
                                  >
                                    {row.complete_weeks}/{row.weeks_required}
                                    {row.is_eligible ? " ✓" : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}

                        <DrawControls
                          drawId={draw.id}
                          entrants={entrants}
                          eligible={eligible}
                        />
                      </>
                    )}
                  </Card>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
