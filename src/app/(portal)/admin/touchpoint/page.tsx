import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/member";
import { getRecentTouchpoints } from "@/lib/admin/touchpoint";
import { addDays } from "@/lib/onboarding/cadence";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Friday questions — aOS admin" };

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });
const WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The Friday half of the Friday/Monday touchpoint (§4).
 *
 * Members write into "Anything else this week" on their weekly log; Nina reads
 * them here and answers live in portal chat during the Monday window. There is
 * deliberately no "answered" flag: the response lives in chat, and a second
 * record of whether it happened would be a duplicate that can disagree with the
 * conversation itself. Once chat exists, that thread is the state.
 */
export default async function TouchpointPage() {
  await requireAdmin();
  const weeks = await getRecentTouchpoints();

  const total = weeks.reduce((sum, week) => sum + week.entries.length, 0);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Friday questions"
        title="What members are stuck on"
        intro="Written into “Anything else this week” on their weekly log. You answer these live in chat during the Monday window — this is the reading list, not a queue to work through."
      />

      {total === 0 ? (
        <Card>
          <p className="text-small text-navy/70">
            Nothing from the last fortnight. Members write here as part of
            signing off their week, so this fills up towards Friday.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {weeks.map((week) => (
            <section key={week.weekStart}>
              <h2 className="font-display mb-3 text-heading text-navy italic">
                Week of {DAY.format(new Date(week.weekStart))}
                <span className="ml-2 font-sans text-small font-normal text-navy/50">
                  to {DAY.format(new Date(addDays(week.weekStart, 6)))}
                </span>
              </h2>

              {week.entries.length === 0 ? (
                <Card>
                  <p className="text-small text-navy/60">Nothing this week.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {week.entries.map((entry) => (
                    <Card key={entry.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <div>
                          <p className="font-medium text-navy">
                            {entry.members?.full_name ?? "Member"}
                          </p>
                          <p className="text-caption text-navy/50">
                            {entry.members?.email}
                          </p>
                        </div>
                        <p className="font-mono text-caption text-navy/50">
                          {entry.submitted_at
                            ? WHEN.format(new Date(entry.submitted_at))
                            : "not signed off"}
                        </p>
                      </div>

                      <p className="mt-3 border-l-2 border-orange/40 pl-3 text-body text-navy/80">
                        {entry.other_activity}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <Eyebrow>Answering these</Eyebrow>
        <p className="mt-2 text-small text-navy/70">
          Live in portal chat during the Monday window, by voice note if
          that&rsquo;s quicker. Chat is Step 11 — until then these are readable
          here and answerable wherever you already talk to members.
        </p>
      </Card>
    </main>
  );
}
