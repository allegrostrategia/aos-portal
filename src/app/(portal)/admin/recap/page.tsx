import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { getRecapSource } from "@/lib/admin/recap-source";
import { compileRecapSource } from "@/lib/recap/compile";
import { isRecapMonth, lastCompleteMonth, monthOf, shiftMonth } from "@/lib/recap/month";
import { formatCalendarMonth, formatSessionTimeShort } from "@/lib/time-zone";
import { Badge, Card, Eyebrow, PageHeader, Stat } from "@/components/ui/card";
import { EmailStatus, RecapForm, SendForm, SourceBlock } from "./recap-forms";

export const metadata: Metadata = { title: "Monthly reviews · aOS admin" };

/**
 * Writing a member's monthly recap (brief).
 *
 * The same pattern as the roadmap and the reveal document, and the same rule 2
 * reason: the app collates, a person writes. What this screen does is put a
 * month of somebody's real data in one block Nina can copy in a single tap,
 * and give the finished text somewhere to land. Nothing here drafts anything.
 *
 * The month defaults to the one that just ended, because that is what a recap
 * is about — opening this in early October to write up October would be the
 * wrong answer every time.
 */
export default async function AdminRecapPage({
  searchParams,
}: PageProps<"/admin/recap">) {
  await requireAdmin();
  const params = await searchParams;

  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from("members")
    .select("id, full_name, status")
    .eq("role", "member")
    .in("status", ["active", "onboarding"])
    .order("full_name");
  const members = (memberRows ?? []) as { id: string; full_name: string; status: string }[];

  const wantedMember = typeof params.member === "string" ? params.member : null;
  const member = members.find((m) => m.id === wantedMember) ?? null;

  const wantedMonth = typeof params.month === "string" ? `${params.month.slice(0, 7)}-01` : null;
  const month = wantedMonth && isRecapMonth(wantedMonth) ? wantedMonth : lastCompleteMonth();

  // Enough months to cover a member's whole term without a date picker: the
  // last six that have finished. Writing up a month before it ends isn't a
  // thing anyone asked for, so this month isn't offered.
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(lastCompleteMonth(), -i));

  const [source, existingRow] = await Promise.all([
    member ? getRecapSource(member.id, month) : Promise.resolve(null),
    member
      ? supabase
          .from("monthly_recaps")
          .select("body, personal_line, sent_at, opened_at, email_sent_at, email_error")
          .eq("member_id", member.id)
          .eq("recap_month", month)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const existing = (existingRow?.data ?? null) as
    | {
        body: string | null;
        personal_line: string | null;
        sent_at: string | null;
        opened_at: string | null;
        email_sent_at: string | null;
        email_error: string | null;
      }
    | null;

  // Who's still waiting, at a glance: written up or not, for the same month.
  const { data: doneRows } = await supabase
    .from("monthly_recaps")
    .select("member_id, sent_at")
    .eq("recap_month", month);
  const sentTo = new Set(
    ((doneRows ?? []) as { member_id: string; sent_at: string | null }[])
      .filter((row) => row.sent_at)
      .map((row) => row.member_id),
  );

  const href = (memberId: string, forMonth: string) =>
    `/admin/recap?member=${memberId}&month=${forMonth.slice(0, 7)}`;

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Monthly reviews"
        intro="A member's month in one block, ready to paste into Claude. You write the recap there and bring it back here; nothing in aOS drafts a word of it."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <Eyebrow>Month</Eyebrow>
            <div className="mt-3 flex flex-wrap gap-2">
              {months.map((option) => (
                <Link
                  key={option}
                  href={member ? href(member.id, option) : `/admin/recap?month=${option.slice(0, 7)}`}
                  className={`rounded-full px-3.5 py-1.5 text-small font-medium transition ${
                    option === month ? "bg-ink text-cream" : "bg-cream-deep text-ink hover:bg-ink/10"
                  }`}
                >
                  {formatCalendarMonth(option)}
                </Link>
              ))}
            </div>
            {month === monthOf() ? (
              <p className="mt-3 text-caption text-orange">
                This month isn&rsquo;t over yet. The numbers will keep moving.
              </p>
            ) : null}
          </Card>

          <Card padded={false}>
            <Eyebrow className="px-5 pt-5">Who</Eyebrow>
            <ul className="divide-y divide-ink/6 p-2">
              {members.length === 0 ? (
                <li className="px-3 py-3 text-small text-ink/60">No members yet.</li>
              ) : (
                members.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={href(m.id, month)}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-small transition ${
                        member?.id === m.id ? "bg-cream-deep font-medium text-ink" : "text-ink/80 hover:bg-cream-deep"
                      }`}
                    >
                      <span className="truncate">{m.full_name}</span>
                      {sentTo.has(m.id) ? <Badge tone="sky">Sent</Badge> : null}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>

        <section className="flex flex-col gap-5">
          {!member ? (
            <Card>
              <p className="text-small text-ink/70">
                Pick a member. You&rsquo;ll get their {formatCalendarMonth(month)} —
                hours, what they finished, what they built, and what they wrote on
                their Friday logs — as one block to copy.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-title font-medium text-ink">
                  {member.full_name}
                  <span className="ml-2 font-sans text-small font-normal text-ink/55">
                    {formatCalendarMonth(month)}
                  </span>
                </h2>
                {existing?.sent_at ? (
                  <Badge tone={existing.opened_at ? "sky" : "gold"}>
                    {existing.opened_at
                      ? `Read ${formatSessionTimeShort(existing.opened_at)}`
                      : `Sent ${formatSessionTimeShort(existing.sent_at)}, unread`}
                  </Badge>
                ) : existing?.body ? (
                  <Badge>Draft saved</Badge>
                ) : null}
              </div>

              <Card>
                <Eyebrow>1 · Their month, collated</Eyebrow>
                <div className="mt-3">
                  {source ? (
                    <SourceBlock source={compileRecapSource(source)} />
                  ) : (
                    <p className="text-small text-ink/60">Couldn&rsquo;t read that member.</p>
                  )}
                </div>
                {source && source.reflections.length > 0 ? (
                  <p className="mt-3 rounded-lg bg-lemon/30 px-3 py-2 text-caption text-ink/75">
                    Includes {source.reflections.length}{" "}
                    {source.reflections.length === 1 ? "private Friday reflection" : "private Friday reflections"}.
                    Theirs and yours only — for this member&rsquo;s own recap, never a
                    shared room, and it leaves aOS when you paste it.
                  </p>
                ) : null}
              </Card>

              <Card>
                <Eyebrow>2 · The recap you wrote</Eyebrow>
                <div className="mt-3">
                  <RecapForm
                    memberId={member.id}
                    month={month}
                    body={existing?.body ?? ""}
                    personalLine={existing?.personal_line ?? ""}
                    sent={Boolean(existing?.sent_at)}
                  />
                </div>
              </Card>

              {existing?.sent_at ? (
                <>
                  <Card>
                    <Stat
                      label="Sent"
                      value={formatSessionTimeShort(existing.sent_at)}
                      detail={
                        existing.opened_at
                          ? `They read it ${formatSessionTimeShort(existing.opened_at)}.`
                          : "Not read yet. The card stays on their Piazza until they do."
                      }
                    />
                  </Card>
                  <Card>
                    <Eyebrow>The email</Eyebrow>
                    <div className="mt-3">
                      <EmailStatus
                        memberId={member.id}
                        month={month}
                        emailSentAt={existing.email_sent_at}
                        emailError={existing.email_error}
                      />
                    </div>
                  </Card>
                </>
              ) : (
                <Card>
                  <Eyebrow>3 · Send it</Eyebrow>
                  <div className="mt-3">
                    <SendForm
                      memberId={member.id}
                      month={month}
                      ready={Boolean(existing?.body?.trim())}
                    />
                  </div>
                </Card>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
