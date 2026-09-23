"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRecapSource } from "@/lib/admin/recap-source";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email/send";
import { renderEmail } from "@/lib/jobs/copy";
import { RECAP_COPY, type RecapStats } from "@/lib/recap/copy";
import { isRecapMonth } from "@/lib/recap/month";
import { formatCalendarDate } from "@/lib/time-zone";

export type RecapState = { error?: string; notice?: string } | null;

/**
 * Writing and sending a member's monthly recap (brief §2, §3).
 *
 * Two steps, not one. Nina pastes and saves; the member still cannot see it.
 * Then she sends, and that is what emails them and puts the card on their
 * Piazza. The same reason the reveal document allows a half-written save —
 * this gets pasted, read back, and adjusted — plus one more: sending is the
 * irreversible half, and a form where saving also sends is a form where a
 * stray Enter mails somebody a paragraph about themselves.
 */

async function loadRecap(memberId: string, month: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_recaps")
    .select("id, body, sent_at, opened_at")
    .eq("member_id", memberId)
    .eq("recap_month", month)
    .maybeSingle();
  return data as
    | { id: string; body: string | null; sent_at: string | null; opened_at: string | null }
    | null;
}

export async function saveRecap(
  _prev: RecapState,
  formData: FormData,
): Promise<RecapState> {
  await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  const month = String(formData.get("recap_month") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!memberId) return { error: "Which member?" };
  if (!isRecapMonth(month)) return { error: "Which month?" };

  const existing = await loadRecap(memberId, month);
  if (existing?.sent_at) {
    // Editing after sending would change what they were emailed, silently,
    // and possibly after they had read it. A correction is a new message from
    // Nina, not a rewrite of history.
    return {
      error: `That recap was sent on ${formatCalendarDate(existing.sent_at.slice(0, 10))} and can't be rewritten. Message them if something needs correcting.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("monthly_recaps").upsert(
    { member_id: memberId, recap_month: month, body: body || null },
    { onConflict: "member_id,recap_month" },
  );

  if (error) return { error: `Couldn't save that: ${error.message}` };

  revalidatePath("/admin/recap");
  return { notice: body ? "Saved. Not sent yet." : "Saved as empty. Nothing to send yet." };
}

/**
 * Send it: the email, and the card on their Piazza.
 *
 * Email goes from here in `after()` rather than through the daily `due_jobs`
 * cron, for the same reason the pairing overlap message does: Nina presses
 * send when she means it to arrive, and "tomorrow at eight" is not that. The
 * card does not depend on delivery — it is on Piazza the moment `sent_at` is
 * set, so a failed email costs the email, not the recap.
 *
 * No push. The brief asks for email and a card; adding a notification nobody
 * asked for is a decision for Nina, not a freebie.
 */
export async function sendRecap(
  _prev: RecapState,
  formData: FormData,
): Promise<RecapState> {
  await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  const month = String(formData.get("recap_month") ?? "").trim();
  if (!memberId) return { error: "Which member?" };
  if (!isRecapMonth(month)) return { error: "Which month?" };

  const existing = await loadRecap(memberId, month);
  if (!existing) return { error: "Nothing saved for that month yet." };
  if (!existing.body?.trim()) return { error: "There's no recap written yet to send." };
  if (existing.sent_at) return { error: "Already sent. It's on their Piazza and in their profile." };

  // The figures the card and email quote, frozen now: they must agree with the
  // recap Nina wrote from them, and a month's numbers can still move afterwards
  // (a forgotten hour logged late, a rate backdated). Null if the collator
  // can't read the member, which the copy falls back around rather than
  // blocking a send over a subtitle.
  const source = await getRecapSource(memberId, month);
  const stats = source
    ? {
        trackedHours: source.loggedMinutes / 60,
        reclaimedHours: source.hoursReclaimedThisMonth,
        actionsDone: source.actionsDone.length,
      }
    : null;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("monthly_recaps")
    .update({ sent_at: new Date().toISOString(), stats })
    .eq("id", existing.id)
    .is("sent_at", null)
    .select("id");

  if (error) return { error: `Couldn't send it: ${error.message}` };
  // No row back means somebody else sent it between the read above and here.
  if (!updated || (updated as { id: string }[]).length === 0) {
    return { error: "Already sent. It's on their Piazza and in their profile." };
  }

  const recapId = existing.id;
  after(() => emailRecap(recapId));

  revalidatePath("/admin/recap");
  revalidatePath("/", "layout");
  return {
    notice:
      "Sent. It's on their Piazza and emailed, and it stays in their profile. You'll see here when they've read it.",
  };
}

/**
 * The email, sent out of band.
 *
 * Service role, because it reads the member's address after the admin's own
 * request has gone. A failure is logged, not retried: the recap is on their
 * Piazza either way, which is the copy of this message that matters.
 *
 * Not gated on a notification switch. The three that exist are for the
 * recurring machinery — reminders, chat, pairing — and a once-a-month piece
 * of writing about them personally, from Nina, is not that. Worth revisiting
 * if a member ever asks.
 */
async function emailRecap(recapId: string): Promise<void> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("monthly_recaps")
    .select("recap_month, member_id, stats, members(full_name, email, status)")
    .eq("id", recapId)
    .maybeSingle();

  const recap = data as unknown as {
    recap_month: string;
    member_id: string;
    stats: RecapStats | null;
    members: { full_name: string; email: string; status: string } | null;
  } | null;
  if (!recap?.members) return;
  if (recap.members.status === "cancelled") return;

  const copy = RECAP_COPY.email({
    firstName: recap.members.full_name.split(" ")[0],
    month: recap.recap_month,
    url: `${env.siteUrl}/reviews/${recap.recap_month.slice(0, 7)}`,
    stats: recap.stats,
  });

  const result = await sendEmail({
    to: recap.members.email,
    subject: copy.subject,
    text: renderEmail(copy),
  });
  if (!result.ok) console.error("[recap] email failed", recapId, result.error);
}
