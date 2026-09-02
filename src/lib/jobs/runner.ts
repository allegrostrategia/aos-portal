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
import { formatSessionTime } from "@/lib/time-zone";
import { hotSeatCopy, renderEmail, weeklyLogCopy } from "./copy";
import {
  daysBetween,
  kindsForDaysUntil,
  shouldSendHotSeatReminder,
  type HotSeatReminderKind,
} from "./hot-seat-reminders";

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

  const copy = weeklyLogCopy(job.kind, {
    firstName,
    loggedMinutes: logged,
    shortBy: short,
    logUrl,
  });

  const result = await sendEmail({
    to: member.email,
    subject: copy.subject,
    text: renderEmail(copy),
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

/**
 * Queue the hot seat reminders that become due today (§5).
 *
 * Sessions without a `scheduled_for` are skipped: there's no date to count back
 * from, so any reminder would be guessing. Nina setting the time is what starts
 * the run-up.
 */
async function planHotSeatReminders(today: string): Promise<number> {
  const admin = createAdminClient();

  const { data: sessionRows } = await admin
    .from("hot_seat_sessions")
    .select("id, scheduled_for")
    .not("scheduled_for", "is", null);

  const sessions = (sessionRows ?? []) as {
    id: string;
    scheduled_for: string;
  }[];

  const due = sessions
    .map((session) => ({
      session,
      // The session's own date, in UTC. A member in a different timezone might
      // see the "morning of" email the previous evening; acceptable for a
      // membership that runs on one clock, and worth revisiting if it doesn't.
      daysUntil: daysBetween(today, session.scheduled_for.slice(0, 10)),
    }))
    .flatMap(({ session, daysUntil }) =>
      kindsForDaysUntil(daysUntil).map((kind) => ({ session, kind })),
    );

  if (due.length === 0) return 0;

  // Hot seat is locked until active (§1), so onboarding members aren't reminded
  // about something they can't take part in yet.
  const { data: memberRows } = await admin
    .from("members")
    .select("id")
    .eq("role", "member")
    .eq("status", "active");

  const members = (memberRows ?? []) as { id: string }[];
  if (members.length === 0) return 0;

  const rows = due.flatMap(({ session, kind }) =>
    members.map((member) => ({
      kind,
      member_id: member.id,
      due_on: today,
      dedupe_key: `${kind}:${member.id}:${session.id}`,
      payload: { session_id: session.id },
    })),
  );

  const { data: inserted } = await admin
    .from("due_jobs")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  return (inserted ?? []).length;
}

async function runHotSeatReminder(
  admin: ReturnType<typeof createAdminClient>,
  job: {
    id: string;
    kind: HotSeatReminderKind;
    member_id: string;
    payload: { session_id?: string };
  },
): Promise<"sent" | "skipped" | "failed"> {
  const sessionId = job.payload.session_id;
  if (!sessionId) return "skipped";

  const [{ data: memberRow }, { data: sessionRow }, { data: submissionRow }] =
    await Promise.all([
      admin
        .from("members")
        .select("email, full_name, status")
        .eq("id", job.member_id)
        .maybeSingle(),
      admin
        .from("hot_seat_sessions")
        .select("scheduled_for, zoom_url")
        .eq("id", sessionId)
        .maybeSingle(),
      admin
        .from("hot_seat_submissions")
        .select("submitted_at")
        .eq("member_id", job.member_id)
        .eq("session_id", sessionId)
        .maybeSingle(),
    ]);

  const member = memberRow as
    | { email: string; full_name: string; status: string }
    | null;
  const session = sessionRow as
    | { scheduled_for: string | null; zoom_url: string | null }
    | null;

  // Cancelled, or no longer active, between planning and running.
  if (!member || member.status !== "active" || !session) return "skipped";

  const hasSubmitted = Boolean(
    (submissionRow as { submitted_at: string | null } | null)?.submitted_at,
  );

  if (!shouldSendHotSeatReminder(job.kind, hasSubmitted)) return "skipped";

  const firstName = member.full_name.split(" ")[0];
  const base = env.siteUrl ?? "https://aos.allegrostrategia.com";
  const when = session.scheduled_for
    ? formatSessionTime(session.scheduled_for)
    : "week one";

  const message = hotSeatCopy(job.kind, {
    firstName,
    when,
    zoomUrl: session.zoom_url,
    baseUrl: base,
    hasSubmitted,
  });

  const result = await sendEmail({
    to: member.email,
    subject: message.subject,
    text: renderEmail(message),
  });

  if (!result.ok) {
    await admin.from("due_jobs").update({ last_error: result.error }).eq("id", job.id);
    return "failed";
  }

  return "sent";
}

/**
 * Queue the hours-reclaimed ledger for weeks that have closed (§2, Step 10).
 *
 * Plans the last four completed weeks every day, not just the most recent one.
 * Planning is idempotent through `dedupe_key`, so re-planning a week already
 * queued or already done costs nothing — and it means a cron outage of up to a
 * month heals itself on the next run rather than needing a manual backfill. The
 * build plan is explicit that a failed run must not silently cost members hours
 * they earned, and this is how that promise is kept.
 *
 * Members only. Admin rows are `status = 'active'` too, and Nina does not accrue
 * hours from builds she ran for other people.
 */
const LEDGER_WEEKS_BACK = 4;

async function planHoursLedger(today: string): Promise<number> {
  const admin = createAdminClient();

  const { data: memberRows } = await admin
    .from("members")
    .select("id")
    .eq("role", "member")
    .eq("status", "active");

  const members = (memberRows ?? []) as { id: string }[];
  if (members.length === 0) return 0;

  // The week containing `today` hasn't closed yet, so the most recent closed
  // week is the one before it.
  const thisMonday = mondayOf(today);
  const weeks = Array.from({ length: LEDGER_WEEKS_BACK }, (_, i) =>
    addDays(thisMonday, -7 * (i + 1)),
  );

  const rows = members.flatMap((member) =>
    weeks.map((weekStart) => ({
      kind: "hours_ledger_week" as const,
      member_id: member.id,
      // Runnable from the Monday the week closed; `lte` in the runner picks up
      // anything older that never ran.
      due_on: addDays(weekStart, 7),
      dedupe_key: `hours_ledger_week:${member.id}:${weekStart}`,
      payload: { week_start: weekStart },
    })),
  );

  const { data: inserted } = await admin
    .from("due_jobs")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  return (inserted ?? []).length;
}

/**
 * Write one week into the ledger.
 *
 * All the deciding happens in `accrue_hours_for_week()` — whether the week
 * qualified, what the active rates were, and the uniqueness that makes a repeat
 * call harmless. This just reports which way it went, so a week that didn't
 * qualify is recorded as skipped rather than failed: not qualifying is a normal
 * outcome, not an error.
 */
async function runHoursLedger(
  admin: ReturnType<typeof createAdminClient>,
  job: { member_id: string; payload: { week_start?: string } },
): Promise<"sent" | "skipped" | "failed"> {
  const weekStart = job.payload.week_start;
  if (!weekStart) return "failed";

  const { data, error } = await admin.rpc("accrue_hours_for_week", {
    p_member_id: job.member_id,
    p_week_start: weekStart,
  });

  if (error) throw new Error(error.message);

  // Null means the week didn't qualify — under ten hours, or the log was never
  // submitted. Nothing to do, and nothing wrong.
  return data === null ? "skipped" : "sent";
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

  summary.planned =
    (await planReminders(today)) +
    (await planHotSeatReminders(today)) +
    (await planHoursLedger(today));

  const admin = createAdminClient();

  // `lte` rather than `eq`: a missed day is caught up rather than lost.
  const { data } = await admin
    .from("due_jobs")
    .select("id, kind, member_id, payload, attempts")
    .eq("status", "pending")
    .lte("due_on", today)
    .order("due_on")
    .limit(500);

  // One payload shape covering every kind. Each handler reads only the keys it
  // needs, so a new job kind adds a key rather than a new column.
  const jobs = (data ?? []) as {
    id: string;
    kind: string;
    member_id: string;
    payload: { week_start?: string; session_id?: string };
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
      } else if (job.kind.startsWith("hot_seat_")) {
        outcome = await runHotSeatReminder(admin, {
          ...job,
          kind: job.kind as HotSeatReminderKind,
        });
      } else if (job.kind === "hours_ledger_week") {
        outcome = await runHoursLedger(admin, job);
      } else {
        // build_check_in has no handler yet (Step 11). Left pending rather than
        // marked done, so it runs when its handler lands instead of being
        // silently consumed now.
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
