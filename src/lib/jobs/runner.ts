import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { APP_TIME_ZONE, formatCalendarMonth } from "@/lib/time-zone";
import { monthIsFinished } from "@/lib/reporting/completion-input";
import { SHIPPED_STAGE } from "@/lib/reporting/categories";
import {
  planReminders as planReportReminderRules,
  ukDayOfMonth,
  ukPreviousMonth,
  type ReminderCandidate,
} from "@/lib/reporting/reminder-plan";
import { mondayOf, addDays } from "@/lib/onboarding/cadence";
import {
  reminderKindForDate,
  remainingMinutes,
  shouldSendReminder,
  type ReminderKind,
} from "./reminders";
import { formatSessionTime } from "@/lib/time-zone";
import {
  buildCheckInCopy,
  chatUnreadCopy,
  hotSeatCopy,
  pairingBookedCopy,
  roadmapIdleCopy,
  reportReminderCopy,
  pairingStalledCopy,
  renderEmail,
  weeklyLogCopy,
} from "./copy";
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

/**
 * The handlers below are exported for tests, not because anything else calls
 * them — `runDueJobs` is the only real entry point.
 *
 * Testing through `runDueJobs` would be better, and isn't practical: it plans
 * every job kind first, and its pending-jobs query uses PostgREST's `or(...)`
 * syntax, which the test fixture would have to reimplement. Exporting the units
 * buys the coverage that matters — which rows a handler reads, what it skips,
 * and what the email says — at the cost of a slightly wider surface.
 *
 * These are where "nothing was sent" and "the wrong person was emailed" live,
 * and both fail silently. That's worth an export.
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

export async function runReminder(
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
    .select("id, email, full_name, status, notify_reminders")
    .eq("id", job.member_id)
    .maybeSingle();

  const member = data as (MemberRow & { status: string; notify_reminders: boolean }) | null;

  // Cancelled between planning and running: nothing to say to them.
  if (!member || member.status === "cancelled") return "skipped";
  // Turned reminders off (You → Notifications). Skipped, not failed: the job
  // did its job, which was to ask.
  if (!member.notify_reminders) return "skipped";

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

export async function runHotSeatReminder(
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
        .select("email, full_name, status, notify_reminders")
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
    | { email: string; full_name: string; status: string; notify_reminders: boolean }
    | null;
  const session = sessionRow as
    | { scheduled_for: string | null; zoom_url: string | null }
    | null;

  // Cancelled, or no longer active, between planning and running.
  if (!member || member.status !== "active" || !session) return "skipped";
  if (!member.notify_reminders) return "skipped";

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
 * All the deciding happens in `accrue_hours_for_week()` — what the active
 * rates were, and the uniqueness that makes a repeat call harmless. Since 14
 * Sep (round 2, D) there is no qualifying condition: a live build accrues
 * every week. The function never returns null now; the null branch below is
 * kept so an older database still behaves, and reports skipped rather than
 * failed because that was never an error.
 */
export async function runHoursLedger(
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

  // Null: only from a database still on the old rule (under ten hours, or never
  // submitted). Nothing to do, and nothing wrong.
  return data === null ? "skipped" : "sent";
}

/**
 * Email somebody about a direct message they haven't read (§4).
 *
 * **Direct messages only.** Notifying every member about every post in General
 * an hour later is precisely the inbox-clogging this is meant to avoid, and the
 * case that actually needs covering is the Friday/Monday touchpoint — a DM, with
 * days between the question and the answer. Open channels stay something you
 * find by visiting, and that can be widened later if anyone misses it.
 *
 * One notification per unread run, not per message. The dedupe key is the
 * *oldest* unread message in the conversation, so a burst of five messages sends
 * one email, and no email is ever sent twice for the same backlog. Read the
 * conversation and the next unread message becomes a different oldest — a new
 * key, and a new notification if that one is left too.
 */
const UNREAD_AFTER_MINUTES = 60;

async function planChatNotifications(now: Date): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(now.getTime() - UNREAD_AFTER_MINUTES * 60_000);

  // Direct channels and who is in them. Small by nature — one row per person per
  // conversation — so this stays a cheap read.
  const { data: participantRows } = await admin
    .from("chat_participants")
    .select("channel_id, member_id, chat_channels!inner(kind)");

  const participants = ((participantRows ?? []) as unknown as {
    channel_id: string;
    member_id: string;
    chat_channels: { kind: string } | null;
  }[]).filter((row) => row.chat_channels?.kind === "direct");

  if (participants.length === 0) return 0;

  const channelIds = [...new Set(participants.map((p) => p.channel_id))];

  const [{ data: messageRows }, { data: readRows }] = await Promise.all([
    admin
      .from("chat_messages")
      .select("id, channel_id, member_id, created_at")
      .in("channel_id", channelIds)
      .lte("created_at", cutoff.toISOString())
      .order("created_at"),
    admin
      .from("chat_reads")
      .select("channel_id, member_id, last_read_at")
      .in("channel_id", channelIds),
  ]);

  const messages = (messageRows ?? []) as {
    id: string;
    channel_id: string;
    member_id: string;
    created_at: string;
  }[];

  const lastRead = new Map(
    ((readRows ?? []) as { channel_id: string; member_id: string; last_read_at: string }[])
      .map((r) => [`${r.channel_id}:${r.member_id}`, r.last_read_at]),
  );

  const rows: Record<string, unknown>[] = [];

  for (const participant of participants) {
    const read = lastRead.get(`${participant.channel_id}:${participant.member_id}`);

    // Their own messages are never unread to them.
    const unread = messages.filter(
      (m) =>
        m.channel_id === participant.channel_id &&
        m.member_id !== participant.member_id &&
        (!read || m.created_at > read),
    );

    if (unread.length === 0) continue;

    const oldest = unread[0];
    rows.push({
      kind: "chat_unread",
      member_id: participant.member_id,
      // Both set: `due_on` keeps the existing daily query working, `due_at` is
      // what actually decides, so a sub-daily runner fires it on time.
      due_on: now.toISOString().slice(0, 10),
      due_at: new Date(
        new Date(oldest.created_at).getTime() + UNREAD_AFTER_MINUTES * 60_000,
      ).toISOString(),
      dedupe_key: `chat_unread:${participant.member_id}:${oldest.id}`,
      payload: {
        channel_id: participant.channel_id,
        oldest_message_id: oldest.id,
        count: unread.length,
      },
    });
  }

  if (rows.length === 0) return 0;

  const { data: inserted } = await admin
    .from("due_jobs")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  return (inserted ?? []).length;
}

/**
 * Send it — unless they've read the conversation since it was queued.
 *
 * Re-checked at run time for the same reason the log reminders are: a queued
 * notification that fires after somebody has already replied is worse than no
 * notification, because it teaches them the emails aren't worth opening.
 */
export async function runChatNotification(
  admin: ReturnType<typeof createAdminClient>,
  job: {
    member_id: string;
    payload: { channel_id?: string; oldest_message_id?: string; count?: number };
  },
): Promise<"sent" | "skipped" | "failed"> {
  const { channel_id: channelId, oldest_message_id: oldestId } = job.payload;
  if (!channelId || !oldestId) return "failed";

  const [{ data: oldest }, { data: read }, { data: recipient }] = await Promise.all([
    admin.from("chat_messages").select("created_at, member_id").eq("id", oldestId).maybeSingle(),
    admin
      .from("chat_reads")
      .select("last_read_at")
      .eq("channel_id", channelId)
      .eq("member_id", job.member_id)
      .maybeSingle(),
    admin.from("members").select("email, full_name, notify_chat").eq("id", job.member_id).maybeSingle(),
  ]);

  const message = oldest as { created_at: string; member_id: string } | null;
  const recipientRow = recipient as { email: string; full_name: string; notify_chat: boolean } | null;
  if (!message || !recipientRow) return "skipped";
  if (!recipientRow.notify_chat) return "skipped";

  const readAt = (read as { last_read_at: string } | null)?.last_read_at;
  if (readAt && readAt >= message.created_at) return "skipped";

  const { data: sender } = await admin
    .from("members")
    .select("full_name")
    .eq("id", message.member_id)
    .maybeSingle();

  const copy = chatUnreadCopy({
    firstName: recipientRow.full_name.split(" ")[0],
    fromName: (sender as { full_name: string } | null)?.full_name ?? "Someone",
    count: job.payload.count ?? 1,
    chatUrl: `${env.siteUrl}/sociale/${channelId}`,
  });

  const result = await sendEmail({
    to: recipientRow.email,
    subject: copy.subject,
    text: renderEmail(copy),
  });

  // Reported as failed rather than swallowed, so a delivery problem shows up in
  // the run summary instead of looking like a quiet success.
  if (!result.ok) throw new Error(result.error ?? "Send failed");

  return "sent";
}

/**
 * Tell somebody who they're paired with (§9).
 *
 * Nothing to plan: the job was queued when the pairing was made. This resolves
 * the partner and sends. Since 21 September 2026 it no longer names shared
 * times: picks are real dates made after the match, and the overlap is its own
 * message, sent the moment both have picked (`@/lib/pairing/overlap`).
 */
export async function runPairingBooked(
  admin: ReturnType<typeof createAdminClient>,
  job: { member_id: string; payload: { pairing_id?: string } },
): Promise<"sent" | "skipped" | "failed"> {
  const pairingId = job.payload.pairing_id;
  if (!pairingId) return "failed";

  const [{ data: pairing }, { data: recipient }] = await Promise.all([
    admin
      .from("pairings")
      .select("pairing_month, pairing_participants(member_id)")
      .eq("id", pairingId)
      .maybeSingle(),
    admin.from("members").select("email, full_name, notify_pairing").eq("id", job.member_id).maybeSingle(),
  ]);

  const row = pairing as
    | { pairing_month: string; pairing_participants: { member_id: string }[] }
    | null;
  const to = recipient as { email: string; full_name: string; notify_pairing: boolean } | null;
  if (!row || !to) return "skipped";
  if (!to.notify_pairing) return "skipped";

  const partnerId = row.pairing_participants
    .map((p) => p.member_id)
    .find((id) => id !== job.member_id);
  if (!partnerId) return "skipped";

  const { data: partner } = await admin
    .from("members")
    .select("full_name")
    .eq("id", partnerId)
    .maybeSingle();

  const copy = pairingBookedCopy({
    firstName: to.full_name.split(" ")[0],
    partnerName:
      (partner as { full_name: string } | null)?.full_name ?? "another member",
    pairingUrl: `${env.siteUrl}/pairing`,
  });

  const result = await sendEmail({
    to: to.email,
    subject: copy.subject,
    text: renderEmail(copy),
  });
  if (!result.ok) throw new Error(result.error ?? "Send failed");

  return "sent";
}

/**
 * A week on, and still unconfirmed — raise it with Nina (§9).
 *
 * Re-checked at run time rather than trusted from when it was queued: a pair who
 * met on day three shouldn't generate a flag on day seven. Setting `flagged_at`
 * and sending happen together, and the flag is only set if it isn't already, so
 * a re-run can't produce a second email about the same silence.
 */
export async function runPairingDay7(
  admin: ReturnType<typeof createAdminClient>,
  job: { member_id: string; payload: { pairing_id?: string } },
): Promise<"sent" | "skipped" | "failed"> {
  const pairingId = job.payload.pairing_id;
  if (!pairingId) return "failed";

  const { data: pairing } = await admin
    .from("pairings")
    .select("pairing_month, met_at, flagged_at, pairing_participants(member_id)")
    .eq("id", pairingId)
    .maybeSingle();

  const row = pairing as
    | {
        pairing_month: string;
        met_at: string | null;
        flagged_at: string | null;
        pairing_participants: { member_id: string }[];
      }
    | null;

  // Met, gone, or already flagged. None of them is worth an email.
  if (!row || row.met_at || row.flagged_at) return "skipped";

  const { data: nina } = await admin
    .from("members")
    .select("email")
    .eq("id", job.member_id)
    .maybeSingle();
  if (!nina) return "skipped";

  const { data: people } = await admin
    .from("members")
    .select("full_name")
    .in("id", row.pairing_participants.map((p) => p.member_id));

  const copy = pairingStalledCopy({
    names: ((people ?? []) as { full_name: string }[]).map((p) => p.full_name),
    month: row.pairing_month.slice(0, 7),
    adminUrl: `${env.siteUrl}/admin/pairing`,
  });

  // `is("flagged_at", null)` guards the gap between the read above and this
  // write: two overlapping cron runs would both pass the in-memory check and
  // both send. No test isolates it — the earlier check already covers the
  // single-runner case — so it is here for the race, not for the common path.
  //
  // The error is checked, and checked before the send: from 3 to 21 Sep the
  // guard trigger refused this write for the service role, the email went
  // anyway, and the job was marked done — so Nina was told once and the flag
  // she'd look for on the admin page was never set. A write that fails now
  // fails the job, visibly, and is retried.
  const { error: flagError } = await admin
    .from("pairings")
    .update({ flagged_at: new Date().toISOString() })
    .eq("id", pairingId)
    .is("flagged_at", null);
  if (flagError) throw new Error(`Couldn't set the day-7 flag: ${flagError.message}`);

  const result = await sendEmail({
    to: (nina as { email: string }).email,
    subject: copy.subject,
    text: renderEmail(copy),
  });
  if (!result.ok) throw new Error(result.error ?? "Send failed");

  return "sent";
}

/**
 * Queue the two-week check-in on each build (§2).
 *
 * Anchored to when the rate started earning rather than when the row was
 * created: that's the date Nina set deliberately as "this is live now", and a
 * build entered retrospectively shouldn't be asked about before it existed.
 *
 * One per build, ever — the dedupe key is the build itself, with no month or
 * date in it. A member who never answers isn't asked again; §2 is explicit that
 * non-response means the rate keeps accruing, because retiring needs evidence
 * rather than silence, and a second email would be chasing them for permission
 * to take hours away.
 *
 * Planned from `effective_from <= today - 14` rather than `= `, so a fortnight
 * the cron missed is still caught rather than skipped forever.
 */
const CHECK_IN_AFTER_DAYS = 14;

/** A week away from La Strada before the first nudge (round 6 §2). */
const ROADMAP_IDLE_DAYS = 7;

/**
 * Who hasn't looked at their roadmap in a week (round 6 §2).
 *
 * "Interacted" is the latest of three marks, not just the page view: opening
 * La Strada (`roadmap_seen`), ticking an action (`roadmap_action_ticks`) and
 * writing an off-the-itinerary note (`roadmap_month_notes`) all count. Only
 * the first had no record before today; using all three is what stops the
 * nudge going to somebody who spent Tuesday ticking things off.
 *
 * **Only members with a published roadmap.** Nudging someone toward a page
 * that says "no roadmap yet" would be asking them to fix Nina's homework.
 *
 * Re-sent weekly while they stay away, and stopped by any of the three marks,
 * because the dedupe key carries the week it was sent for: a member idle for
 * a month gets four, on four different keys, and one visit ends it.
 */
// Exported for the same reason the handlers are: who this reaches is the half
// that fails silently, and `runDueJobs` can't be driven from the harness —
// its pending-jobs query uses PostgREST's `or(...)`, which the fixture would
// have to reimplement.
export async function planRoadmapIdle(today: string): Promise<number> {
  const admin = createAdminClient();
  const cutoff = addDays(today, -ROADMAP_IDLE_DAYS);

  const [{ data: roadmapRows }, { data: seenRows }, { data: tickRows }, { data: noteRows }] =
    await Promise.all([
      admin
        .from("roadmap")
        .select("id, member_id, members!inner(status, role)")
        .eq("is_current", true)
        .not("confirmed_at", "is", null),
      admin.from("roadmap_seen").select("member_id, last_seen_at"),
      admin.from("roadmap_action_ticks").select("member_id, updated_at"),
      admin.from("roadmap_month_notes").select("roadmap_id, updated_at"),
    ]);

  const roadmaps = ((roadmapRows ?? []) as unknown as {
    id: string;
    member_id: string;
    members: { status: string; role: string } | null;
  }[]).filter((r) => r.members?.status === "active" && r.members?.role === "member");
  if (roadmaps.length === 0) return 0;

  // The latest mark per member, whichever kind it was.
  const latest = new Map<string, string>();
  const mark = (memberId: string, at: string | null | undefined) => {
    if (!at) return;
    const current = latest.get(memberId);
    if (!current || at > current) latest.set(memberId, at);
  };
  for (const row of (seenRows ?? []) as { member_id: string; last_seen_at: string }[]) {
    mark(row.member_id, row.last_seen_at);
  }
  for (const row of (tickRows ?? []) as { member_id: string; updated_at: string }[]) {
    mark(row.member_id, row.updated_at);
  }
  const memberByRoadmap = new Map(roadmaps.map((r) => [r.id, r.member_id]));
  for (const row of (noteRows ?? []) as { roadmap_id: string; updated_at: string }[]) {
    const memberId = memberByRoadmap.get(row.roadmap_id);
    if (memberId) mark(memberId, row.updated_at);
  }

  // Never been in at all counts as away: a published roadmap nobody has
  // opened is the case this is most for.
  const idle = roadmaps.filter((r) => (latest.get(r.member_id) ?? "").slice(0, 10) <= cutoff);
  if (idle.length === 0) return 0;

  const rows = idle.map((r) => ({
    kind: "roadmap_idle" as const,
    member_id: r.member_id,
    due_on: today,
    // The week, not the day: one nudge per member per week for as long as
    // they stay away, rather than one every morning.
    dedupe_key: `roadmap_idle:${r.member_id}:${mondayOf(today)}`,
    payload: {},
  }));

  const { data: inserted } = await admin
    .from("due_jobs")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  return (inserted ?? []).length;
}

/**
 * Send it — and check again at send time.
 *
 * The second check is the one that matters: a member who opens La Strada
 * between the 08:00 planning and the send should not be told they have been
 * away, and that is a real gap on a morning when the queue is long.
 */
export async function runRoadmapIdle(
  admin: ReturnType<typeof createAdminClient>,
  job: { member_id: string },
): Promise<"sent" | "skipped" | "failed"> {
  const [{ data: member }, { data: seen }] = await Promise.all([
    admin
      .from("members")
      .select("email, full_name, status, notify_reminders")
      .eq("id", job.member_id)
      .maybeSingle(),
    admin
      .from("roadmap_seen")
      .select("last_seen_at")
      .eq("member_id", job.member_id)
      .maybeSingle(),
  ]);

  const to = member as
    | { email: string; full_name: string; status: string; notify_reminders: boolean }
    | null;
  if (!to || to.status !== "active") return "skipped";
  if (!to.notify_reminders) return "skipped";

  const lastSeen = (seen as { last_seen_at: string } | null)?.last_seen_at;
  if (lastSeen && lastSeen > new Date(Date.now() - ROADMAP_IDLE_DAYS * 86_400_000).toISOString()) {
    return "skipped";
  }

  const copy = roadmapIdleCopy({
    firstName: to.full_name.split(" ")[0],
    roadmapUrl: `${env.siteUrl}/roadmap`,
  });

  const result = await sendEmail({
    to: to.email,
    subject: copy.subject,
    text: renderEmail(copy),
  });
  if (!result.ok) throw new Error(result.error ?? "Send failed");

  return "sent";
}

/**
 * §8.1's two report reminders, planned.
 *
 * The rules themselves are pure and live in
 * `src/lib/reporting/reminder-plan.ts`, with their own tests — which is
 * how the three exclusions Dom named can be proved without waiting for
 * the 1st of a month. This half is only the reading and the writing.
 *
 * **Everything here runs as the service role**, whose `auth.uid()` is
 * null. Nothing it touches may be guarded on `is_portal_admin()` alone.
 */
export async function planReportReminders(
  instant = new Date(),
  /** Injected so both sides of the switch can be tested without
   *  pretending the process is a development server. */
  stage: number = SHIPPED_STAGE,
): Promise<number> {
  // **Nothing is planned, and so nothing is sent, until Stage 5 is on.**
  // This is the one piece of unfinished work that reaches outside the
  // app: `dom` has had a real member workspace on live since the
  // backfill, and without this the 1st of November would have put an
  // email in a real inbox from a stage nobody had turned on.
  if (stage < 5) return 0;

  const day = ukDayOfMonth(instant);
  if (day !== 1 && day !== 8) return 0;

  const admin = createAdminClient();
  const month = ukPreviousMonth(instant);

  const [{ data: workspaceRows }, { data: sentRows }] = await Promise.all([
    // **`aos_member` only, and that is forced as well as intended.**
    // §8.1 is headed "aOS members: completion and reminders" and names
    // only them. It is also the only thing possible: `due_jobs.member_id`
    // is a foreign key to `members`, and a Chiarezza attendee has no
    // members row at all — they are a login with a grant. Queuing one
    // for them fails the key, which is how this was found.
    //
    // The expired-Chiarezza rule stays in `planReminders` even so: it is
    // the rule as specified, it is tested, and the day somebody wants
    // Chiarezza reminded, the thing that has to change is the queue, not
    // the rule.
    admin
      .from("report_workspaces")
      .select("id, owner_user_id, kind, access_end_date")
      .eq("kind", "aos_member"),
    admin.from("report_reminders").select("workspace_id, reminder").eq("month", month),
  ]);

  const workspaces = (workspaceRows ?? []) as {
    id: string;
    owner_user_id: string;
    kind: "retainer" | "aos_member" | "chiarezza";
    access_end_date: string | null;
  }[];
  if (workspaces.length === 0) return 0;

  // A cancelled membership keeps every record and loses every nudge
  // (rule 7). A login with no `members` row is a Chiarezza attendee,
  // whose end date answers the same question a different way.
  const { data: memberRows } = await admin
    .from("members")
    .select("id, status")
    .in("id", workspaces.map((w) => w.owner_user_id));
  const statusOf = new Map(
    ((memberRows ?? []) as { id: string; status: string }[]).map((m) => [m.id, m.status]),
  );

  const sent = new Map<string, number[]>();
  for (const row of (sentRows ?? []) as { workspace_id: string; reminder: number }[]) {
    sent.set(row.workspace_id, [...(sent.get(row.workspace_id) ?? []), row.reminder]);
  }

  // Only the 8th asks whether the month is done, and only for the ones
  // still in the running — a completion check per workspace is the
  // expensive part of this job.
  const candidates: ReminderCandidate[] = [];
  for (const workspace of workspaces) {
    const status = statusOf.get(workspace.owner_user_id);
    candidates.push({
      workspaceId: workspace.id,
      ownerUserId: workspace.owner_user_id,
      kind: workspace.kind,
      accessEndDate: workspace.access_end_date,
      memberHasAccess: status === undefined ? null : status !== "cancelled",
      monthIsDone: day === 8 ? await monthIsFinished(admin, workspace.id, month) : false,
      alreadySent: sent.get(workspace.id) ?? [],
    });
  }

  const planned = planReportReminderRules(candidates, instant);
  if (planned.length === 0) return 0;

  const { data: inserted, error } = await admin
    .from("due_jobs")
    .upsert(
      planned.map((p) => ({
        kind: p.reminder === 1 ? ("report_reminder_1" as const) : ("report_reminder_2" as const),
        member_id: p.ownerUserId,
        due_on: new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(instant),
        // Per workspace per month per reminder, so a catch-up run after a
        // missed morning does not queue a second copy.
        dedupe_key: `report_reminder:${p.workspaceId}:${p.month}:${p.reminder}`,
        payload: { workspace_id: p.workspaceId, month: p.month, reminder: p.reminder },
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");

  // Checked, not swallowed. A queue write that fails quietly is a month
  // where nobody is reminded and nothing says so — and the first version
  // of this did exactly that, returning 0 as though there had been
  // nobody to remind.
  if (error) throw new Error(`Couldn't queue the report reminders: ${error.message}`);

  return (inserted ?? []).length;
}

/** Send one, and check again at send time. */
export async function runReportReminder(
  admin: ReturnType<typeof createAdminClient>,
  job: { member_id: string; kind: string; payload: Record<string, unknown> },
): Promise<"sent" | "skipped" | "failed"> {
  const workspaceId = String(job.payload.workspace_id ?? "");
  const month = String(job.payload.month ?? "");
  const reminder = Number(job.payload.reminder ?? 0);
  if (!workspaceId || !month) return "skipped";

  const { data: member } = await admin
    .from("members")
    .select("email, full_name, status, notify_reminders")
    .eq("id", job.member_id)
    .maybeSingle();

  const to = member as
    | { email: string; full_name: string; status: string; notify_reminders: boolean }
    | null;
  if (!to || to.status === "cancelled" || !to.notify_reminders) return "skipped";

  // The second check, and the one that matters: somebody who filled it
  // in between 08:00 and the send should not be chased. The queue being
  // long is exactly when this happens.
  if (reminder === 2 && (await monthIsFinished(admin, workspaceId, month))) {
    return "skipped";
  }

  const copy = reportReminderCopy({
    firstName: to.full_name.split(" ")[0],
    monthLabel: formatCalendarMonth(month),
    reportUrl: `${env.siteUrl}/reporting`,
    second: reminder === 2,
  });

  const result = await sendEmail({
    to: to.email,
    subject: copy.subject,
    text: renderEmail(copy),
  });
  if (!result.ok) throw new Error(result.error ?? "Send failed");

  // The record that stops a third. Checked, not assumed: if this write
  // fails the next run would send again, and a silent failure here is
  // the whole reason the table exists.
  const { error } = await admin
    .from("report_reminders")
    .upsert(
      { workspace_id: workspaceId, month, reminder, sent_at: new Date().toISOString() },
      { onConflict: "workspace_id,month,reminder", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Sent, but not recorded: ${error.message}`);

  return "sent";
}

async function planBuildCheckIns(today: string): Promise<number> {
  const admin = createAdminClient();
  const cutoff = addDays(today, -CHECK_IN_AFTER_DAYS);

  const { data: rateRows } = await admin
    .from("handover_pack_rates")
    .select("handover_pack_id, effective_from, handover_pack!inner(member_id)")
    .lte("effective_from", cutoff);

  const rates = (rateRows ?? []) as unknown as {
    handover_pack_id: string;
    effective_from: string;
    handover_pack: { member_id: string } | null;
  }[];

  // The first period of each build only. A revised rate opens a new period, and
  // asking again because the number changed would be asking the same question.
  const firstByBuild = new Map<string, { memberId: string }>();
  for (const rate of rates) {
    if (!rate.handover_pack) continue;
    if (!firstByBuild.has(rate.handover_pack_id)) {
      firstByBuild.set(rate.handover_pack_id, {
        memberId: rate.handover_pack.member_id,
      });
    }
  }

  if (firstByBuild.size === 0) return 0;

  const rows = [...firstByBuild.entries()].map(([buildId, { memberId }]) => ({
    kind: "build_check_in" as const,
    member_id: memberId,
    due_on: today,
    dedupe_key: `build_check_in:${buildId}`,
    payload: { handover_pack_id: buildId },
  }));

  const { data: inserted } = await admin
    .from("due_jobs")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id");

  return (inserted ?? []).length;
}

/**
 * Ask the member how a build is holding up.
 *
 * Opens their conversation with the coach first, so the email lands on a link
 * that goes straight to a reply box. Without it the invitation ends at "go and
 * find the right conversation", which is friction on the exact action being
 * asked for.
 *
 * Skipped if there's no coach to reply to, rather than sending somebody to a
 * conversation that doesn't exist.
 */
export async function runBuildCheckIn(
  admin: ReturnType<typeof createAdminClient>,
  job: { member_id: string; payload: { handover_pack_id?: string } },
): Promise<"sent" | "skipped" | "failed"> {
  const buildId = job.payload.handover_pack_id;
  if (!buildId) return "failed";

  const [{ data: build }, { data: member }, { data: coach }] = await Promise.all([
    admin.from("handover_pack").select("title").eq("id", buildId).maybeSingle(),
    admin
      .from("members")
      .select("email, full_name, status, notify_reminders")
      .eq("id", job.member_id)
      .maybeSingle(),
    admin.from("members").select("id").eq("is_coach", true).maybeSingle(),
  ]);

  const buildRow = build as { title: string } | null;
  const memberRow = member as
    | { email: string; full_name: string; status: string; notify_reminders: boolean }
    | null;
  const coachRow = coach as { id: string } | null;

  // A cancelled member isn't asked how their build is going.
  if (!buildRow || !memberRow || memberRow.status === "cancelled") return "skipped";
  // The check-in is a reminder about their own build, so it follows that switch.
  if (!memberRow.notify_reminders) return "skipped";
  if (!coachRow) return "skipped";

  const { data: rate } = await admin
    .from("handover_pack_rates")
    .select("hours_per_week")
    .eq("handover_pack_id", buildId)
    .is("effective_until", null)
    .maybeSingle();

  // Already retired — nothing left to ask about.
  if (!rate) return "skipped";

  const { data: channelId, error: channelError } = await admin.rpc(
    "ensure_direct_channel",
    { p_member_a: job.member_id, p_member_b: coachRow.id },
  );
  if (channelError) throw new Error(channelError.message);

  const copy = buildCheckInCopy({
    firstName: memberRow.full_name.split(" ")[0],
    buildTitle: buildRow.title,
    hoursPerWeek: String(
      Number((rate as { hours_per_week: string | number }).hours_per_week),
    ),
    chatUrl: `${env.siteUrl}/sociale/${channelId as string}`,
  });

  const result = await sendEmail({
    to: memberRow.email,
    subject: copy.subject,
    text: renderEmail(copy),
  });
  if (!result.ok) throw new Error(result.error ?? "Send failed");

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
      "RESEND_API_KEY isn't set. Planning ran, but nothing can be delivered.",
    );
  }

  summary.planned =
    (await planReminders(today)) +
    (await planHotSeatReminders(today)) +
    (await planHoursLedger(today)) +
    (await planChatNotifications(new Date())) +
    (await planBuildCheckIns(today)) +
    (await planRoadmapIdle(today)) +
    (await planReportReminders());

  const admin = createAdminClient();

  // `lte` rather than `eq`: a missed day is caught up rather than lost.
  //
  // Two schedules, so two conditions. Calendar jobs are due on a day; the chat
  // notification is due at a moment, and would otherwise wait until whichever
  // 08:00 came next — which for "unread for an hour" means tomorrow morning.
  const { data } = await admin
    .from("due_jobs")
    .select("id, kind, member_id, payload, attempts")
    .eq("status", "pending")
    .or(`due_at.lte.${new Date().toISOString()},and(due_at.is.null,due_on.lte.${today})`)
    .order("due_on")
    .limit(500);

  // One payload shape covering every kind. Each handler reads only the keys it
  // needs, so a new job kind adds a key rather than a new column.
  const jobs = (data ?? []) as {
    id: string;
    kind: string;
    member_id: string;
    payload: {
      week_start?: string;
      session_id?: string;
      channel_id?: string;
      oldest_message_id?: string;
      count?: number;
      pairing_id?: string;
      handover_pack_id?: string;
    };
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
      } else if (job.kind === "chat_unread") {
        outcome = await runChatNotification(admin, job);
      } else if (job.kind === "pairing_booked") {
        outcome = await runPairingBooked(admin, job);
      } else if (job.kind === "pairing_day7") {
        outcome = await runPairingDay7(admin, job);
      } else if (job.kind === "roadmap_idle") {
        outcome = await runRoadmapIdle(admin, job);
      } else if (job.kind === "report_reminder_1" || job.kind === "report_reminder_2") {
        outcome = await runReportReminder(admin, job);
      } else if (job.kind === "build_check_in") {
        outcome = await runBuildCheckIn(admin, job);
      } else {
        // An unknown kind: left pending rather than marked done, so a handler
        // landing later picks it up instead of it being silently consumed now.
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
