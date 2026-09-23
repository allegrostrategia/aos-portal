import "server-only";

import { createClient } from "@/lib/supabase/server";

export type MyRecap = {
  id: string;
  month: string;
  body: string;
  sentAt: string;
  openedAt: string | null;
};

/**
 * A member's own recaps — the archive on You, and the read page.
 *
 * RLS returns only their own, and only sent ones, so an unsent draft cannot
 * appear here whatever a caller asks for. The explicit `member_id` filter is
 * here anyway: relying on the policy alone is the bug this codebase made once,
 * across eight queries.
 *
 * Every sent recap is listed, read or not. The brief says an opened recap
 * "moves to" the archive, and it does — from Piazza, where the card goes away
 * once read. Hiding a sent recap from its own archive until it had been opened
 * would mean a member who tapped nothing had nowhere at all to find it.
 */
export async function getMyRecaps(memberId: string): Promise<MyRecap[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("monthly_recaps")
    .select("id, recap_month, body, sent_at, opened_at")
    .eq("member_id", memberId)
    .not("sent_at", "is", null)
    .order("recap_month", { ascending: false });

  return ((data ?? []) as {
    id: string;
    recap_month: string;
    body: string | null;
    sent_at: string;
    opened_at: string | null;
  }[]).map((row) => ({
    id: row.id,
    month: row.recap_month,
    body: row.body ?? "",
    sentAt: row.sent_at,
    openedAt: row.opened_at,
  }));
}

export async function getMyRecap(
  memberId: string,
  month: string,
): Promise<MyRecap | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("monthly_recaps")
    .select("id, recap_month, body, sent_at, opened_at")
    .eq("member_id", memberId)
    .eq("recap_month", month)
    .not("sent_at", "is", null)
    .maybeSingle();

  const row = data as
    | {
        id: string;
        recap_month: string;
        body: string | null;
        sent_at: string;
        opened_at: string | null;
      }
    | null;
  if (!row) return null;

  return {
    id: row.id,
    month: row.recap_month,
    body: row.body ?? "",
    sentAt: row.sent_at,
    openedAt: row.opened_at,
  };
}

/**
 * The one the Piazza card is about: sent, not yet read, newest first.
 *
 * Null once they have read it — which is the whole reason `opened_at` is a
 * real timestamp rather than an assumption that a send is a read.
 */
export async function getUnreadRecap(memberId: string): Promise<MyRecap | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("monthly_recaps")
    .select("id, recap_month, body, sent_at, opened_at")
    .eq("member_id", memberId)
    .not("sent_at", "is", null)
    .is("opened_at", null)
    .order("recap_month", { ascending: false })
    .limit(1);

  const row = ((data ?? []) as {
    id: string;
    recap_month: string;
    body: string | null;
    sent_at: string;
    opened_at: string | null;
  }[])[0];
  if (!row) return null;

  return {
    id: row.id,
    month: row.recap_month,
    body: row.body ?? "",
    sentAt: row.sent_at,
    openedAt: row.opened_at,
  };
}
