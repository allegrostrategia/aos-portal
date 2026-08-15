import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { mondayOf, addDays } from "@/lib/onboarding/cadence";
import {
  reminderKindForDate,
  remainingMinutes,
  shouldSendReminder,
  type ReminderKind,
} from "./reminders";
import { formatMinutes } from "@/lib/timer/format";

/**
 * The daily cron: plan what's due, then run what's pending.
 *
 * Two phases on purpose. Planning is idempotent through `dedupe_key`, so it can
 * run any number of times without queueing anything twice. Running picks up
 * everything due on or before today, so a day the cron didn't fire is caught up
 * on the next one rather than lost.
 *
 * Uses the service role: there's no member session behind a cron request, and
 * it needs to read across all members.
 */

export type RunSummary = {
  planned: number;
  ran: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type MemberRow = {
  id: string;
  email: string;
  full_name: string;
};

/** Minutes logged in a given week, straight from the entries. */
async function loggedMinutesForWeek(
  admin: ReturnType<typeof createAdminClient>,
  memberId: string,
  weekStart: string,
): Promise<number> {
  const { data } = await admin
    .from("time_entries")
    .select("duration_minutes")
    .eq("member_id", memberId)
    .gte("started_at", `${weekStart}T00:00:00Z`)
    .lt("started_at", `${addDays(weekStart, 7)}T00:00:00Z`)
    .not("ended_at", "is", null);

  return ((data ?? []) as { duration_minutes: number | null }[]).reduce(
    (total, row) => total + (row.duration_minutes ?? 0),
    0,
  );
}

/**
 * Queue today's reminders.
 *
 * Only members — admins aren't being nudged about their own logging — and only
 * those with portal access. Cancelled members are excluded by status, which is
 * the same gate everything else uses.
 */
async function planReminders(today: string): Promise<number> {
  const kind = reminderKindForDate(today);
  if (!kind) return 0;

  const admin = createAdminClient();
  const weekStart = mondayOf(today);

  const { data } = await admin
    .from("members")
    .select("id, email, full_name")
    .eq("role", "member")
    .in("status", ["onboarding", "active"]);

  const members = (data ?? []) as MemberRow[];
  if (members.length === 0) return 0;

  const rows = members.map((member) => ({
    kind,
    member_id: member.id,
    due_on: today,
    dedupe_key: `${kind}:${member.id}:${weekStart}`,
    payload: { week_start: weekStart },
  }));

  // Planning runs daily; the unique dedupe_key is what makes that safe.
  const { data: inserted } = await admin
    .from("due_jobs")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  return (inserted ?? []).length;
}

async function runReminder(
  admin: ReturnType<typeof createAdminClient>,
  job: {
    id: string;
    kind: ReminderKind;
    member_id: string;
    payload: { week_start?: string };
  },
): Promise<"sent" | "skipped" | "failed"> {
  const weekStart = job.payload.week_start ?? mondayOf(new Date().toISOString().slice(0, 10));

  const { data } = await admin
    .from("members")
    .select("id, email, full_name, status")
    .eq("id", job.member_id)
    .maybeSingle();

  const member = data as (MemberRow & { status: string }) | null;

  // Cancelled between planning and running: nothing to say to them.
  if (!member || member.status === "cancelled") return "skipped";

  const logged = await loggedMinutesForWeek(admin, member.id, weekStart);

  // Re-checked at run time, not just at plan time. Someone who logged four hours
  // in between shouldn't be told they're behind — a stale nudge is exactly the
  // kind of noise §4 is trying to avoid.
  if (!shouldSendReminder(job.kind, logged)) return "skipped";

  const firstName = member.full_name.split(" ")[0];
  const short = remainingMinutes(logged);
  const logUrl = `${env.siteUrl ?? "https://aos.allegrostrategia.com"}/log`;

  const copy =
    job.kind === "log_reminder_midweek"
      ? {
          subject: "Your week so far",
          body: [
            `${firstName},`,
            `You're at ${formatMinutes(logged)} logged this week. Ten hours makes the week count.`,
            `Nothing to fill in — just start the timer when you begin something, and stop it when you're done.`,
            logUrl,
          ],
        }
      : {
          subject: `${formatMinutes(short)} off this week's log`,
          body: [
            `${firstName},`,
            `You're ${formatMinutes(short)} short of a complete week — still time to stay in this month's draw.`,
            `If you've done the hours and not logged them, you can add them after the fact.`,
            logUrl,
          ],
        };

  const result = await sendEmail({
    to: member.email,
    subject: copy.subject,
    text: copy.body.join("\n\n"),
  });

  if (!result.ok) {
    await admin
      .from("due_jobs")
      .update({ last_error: result.error })
      .eq("id", job.id);
    return "failed";
  }

  return "sent";
}

export async function runDueJobs(today: string): Promise<RunSummary> {
  const summary: RunSummary = {
    planned: 0,
    ran: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  if (!isEmailConfigured()) {
    summary.errors.push(
      "RESEND_API_KEY isn't set — planning ran, but nothing can be delivered.",
    );
  }

  summary.planned = await planReminders(today);

  const admin = createAdminClient();

  // `lte` rather than `eq`: a missed day is caught up rather than lost.
  const { data } = await admin
    .from("due_jobs")
    .select("id, kind, member_id, payload, attempts")
    .eq("status", "pending")
    .lte("due_on", today)
    .order("due_on")
    .limit(500);

  const jobs = (data ?? []) as {
    id: string;
    kind: string;
    member_id: string;
    payload: { week_start?: string };
    attempts: number;
  }[];

  for (const job of jobs) {
    summary.ran += 1;

    let outcome: "sent" | "skipped" | "failed" = "skipped";

    try {
      if (
        job.kind === "log_reminder_midweek" ||
        job.kind === "log_reminder_endweek"
      ) {
        outcome = await runReminder(admin, {
          ...job,
          kind: job.kind as ReminderKind,
        });
      } else {
        // hours_ledger_week and build_check_in have no handler yet (Steps 10
        // and 11). Left pending rather than marked done, so they run when their
        // handler lands instead of being silently consumed now.
        summary.skipped += 1;
        continue;
      }
    } catch (cause) {
      outcome = "failed";
      const message = cause instanceof Error ? cause.message : String(cause);
      summary.errors.push(`${job.kind} ${job.id}: ${message}`);
      await admin
        .from("due_jobs")
        .update({ last_error: message })
        .eq("id", job.id);
    }

    if (outcome === "failed") {
      summary.failed += 1;
      await admin
        .from("due_jobs")
        .update({ status: "failed", attempts: job.attempts + 1 })
        .eq("id", job.id);
      continue;
    }

    summary[outcome === "sent" ? "sent" : "skipped"] += 1;
    await admin
      .from("due_jobs")
      .update({
        status: outcome === "sent" ? "done" : "skipped",
        attempts: job.attempts + 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }

  return summary;
}
