"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { categoryByKey } from "./categories.ts";
import { firstOfMonth } from "./months.ts";
import { getWorkspace } from "./queries.ts";
import { canWriteStrategistNote } from "./access.ts";
import { sendPublishEmail } from "./publish-send.ts";
import { lockedError } from "./locked.ts";
import { computeCarried, draftMonthsBefore } from "./carried-build.ts";
import { publishWarning } from "./publish-warning.ts";

/**
 * Notes, and publishing.
 *
 * §8: "Written words come from people, never generated." Nothing in this
 * file or anything it calls goes near an AI (CLAUDE.md rule 2).
 */

export type NoteState = {
  error?: string;
  notice?: string;
  /** Publishing out of order: say it again and it goes (7 Oct 2026). */
  needsConfirm?: boolean;
} | null;

/**
 * Write or revise a strategist note.
 *
 * An author edits their own note for that month and category, and creates
 * one if they have none. Not "the" note for the month: §8 has observations
 * coming from Elize *or* Nina, and a single shared row would mean one of them
 * silently overwriting the other. RLS agrees — the update policy admits the
 * author only.
 */
export async function saveStrategistNote(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const categoryRaw = String(formData.get("category") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  // Null category is the Overview note; anything else must be a real one.
  const category = categoryRaw === "" ? null : categoryByKey(categoryRaw)?.key;
  if (!workspaceId || !month || (categoryRaw !== "" && !category)) {
    return { error: "That note was missing something. Reload and try again." };
  }

  if (body === "") {
    return { error: "There's nothing written to save." };
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." };

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayWrite = canWriteStrategistNote({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });
  if (!mayWrite) {
    // §8's table: for an aOS member the equivalent is their own reflection,
    // which is a different note type and a different screen.
    return { error: "Only your strategist writes this note." };
  }

  const authorName =
    grant?.display_name ?? reportUser.name ?? "Allegro Strategia";

  const supabase = await createClient();

  // The Overview note is the one with no category, which is `is null` and
  // not `eq null` — PostgREST would turn the latter into a comparison that
  // never matches, and every save would insert another note.
  let mineQuery = supabase
    .from("report_notes")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .eq("note_type", "strategist")
    .eq("author_id", reportUser.id);

  mineQuery = category
    ? mineQuery.eq("category", category)
    : mineQuery.is("category", null);

  const { data: mine } = await mineQuery.maybeSingle<{ id: string }>();

  if (mine) {
    const { error } = await supabase
      .from("report_notes")
      .update({ body })
      .eq("id", mine.id);
    if (error) return { error: lockedError(error) ?? `Couldn't save the note: ${error.message}` };
  } else {
    const { error } = await supabase.from("report_notes").insert({
      workspace_id: workspaceId,
      month,
      category,
      note_type: "strategist",
      author_id: reportUser.id,
      author_name: authorName,
      body,
    });
    if (error) return { error: lockedError(error) ?? `Couldn't save the note: ${error.message}` };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Note saved." };
}

/**
 * Publish a month, and tell the client.
 *
 * Nina's alone, decided 30 September 2026. Checked here and refused
 * independently by a guard trigger in the database, which covers the insert
 * as well as the update.
 *
 * §8's email goes from `after()` rather than the daily cron, for the reason
 * the recap's does: Nina publishes when she means the client to hear, and
 * "tomorrow at eight" is not that. **It is deliberately not awaited and its
 * failure is not returned** — the month is published either way, because a
 * report being readable must not depend on an email provider. What happened
 * lands on the period instead, and the publish card reads it back.
 *
 * A month published again after a correction sends again, worded as an
 * update (Nina, 5 October): a client reading a changed figure should know it
 * changed. `email_sent_at` already being set is what makes it the second one.
 */
export async function publishMonth(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();

  if (!reportUser.isAdmin) {
    return { error: "Only Nina can publish a report." };
  }

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) {
    return { error: "That was missing something. Reload and try again." };
  }

  const supabase = await createClient();

  // Read before the write: whether this is the first time this month has
  // gone out decides which email the client gets, and the upsert below is
  // about to make every month look alike.
  const { data: before } = await supabase
    .from("report_periods")
    .select("email_sent_at")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .maybeSingle<{ email_sent_at: string | null }>();

  // **Publishing out of order is refused once, then allowed.** The
  // snapshot below freezes the earlier month's unfinished figures into
  // this one permanently, and publishing emails the client on the way, so
  // she is asked rather than told. Enforced here rather than in the
  // component: a confirm step that lives in `useState` is a confirm step
  // that does not exist before hydration, and the first click published
  // the month exactly that way while this was being built.
  if (String(formData.get("confirm") ?? "") !== "1") {
    const warning = publishWarning(await draftMonthsBefore(workspaceId, month), month);
    if (warning) return { error: warning, needsConfirm: true };
  }

  // What the report contains, frozen onto the month before it goes out, so
  // editing an earlier month later cannot change it (docs/freeze-plan.md).
  // Computed with the service role: the snapshot must be what the report
  // truly contains, not what the publisher can see.
  const carried = await computeCarried(workspaceId, month);

  const { error } = await supabase
    .from("report_periods")
    .upsert(
      {
        workspace_id: workspaceId,
        month,
        published_at: new Date().toISOString(),
        published_by: reportUser.id,
        carried,
      },
      { onConflict: "workspace_id,month" },
    );

  if (error) return { error: `Couldn't publish: ${error.message}` };

  const update = Boolean(before?.email_sent_at);
  after(() => sendPublishEmail(workspaceId, month, { update }));

  revalidatePath("/reporting", "layout");
  return {
    notice: update
      ? "Published again. The client is being emailed to say it has been updated."
      : "Published. The client can see this month now, and is being emailed a link to it.",
  };
}

/**
 * Send the publish email again.
 *
 * The month is published and stays published; this is only the email, which
 * can fail on its own — a provider hiccup, a key rotated, a client login
 * added after the fact. Without this the only retry is unpublishing and
 * republishing a report the client may already have read.
 *
 * Worded as an update when one has gone before, same rule as publishing.
 */
export async function resendPublishEmail(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();
  if (!reportUser.isAdmin) return { error: "Only Nina can email a report." };

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) return { error: "That was missing something." };

  const supabase = await createClient();
  const { data: period } = await supabase
    .from("report_periods")
    .select("published_at, email_sent_at")
    .eq("workspace_id", workspaceId)
    .eq("month", month)
    .maybeSingle<{ published_at: string | null; email_sent_at: string | null }>();

  // Emailing a link to a month the client cannot open is the one outcome
  // worse than not emailing at all.
  if (!period?.published_at) {
    return { error: "That month isn't published, so there is nothing to tell the client about." };
  }

  // Awaited here, unlike on publish: the person pressed a button that does
  // only this, so they should be told whether it worked.
  const result = await sendPublishEmail(workspaceId, month, {
    update: Boolean(period.email_sent_at),
  });

  revalidatePath("/reporting", "layout");
  if (!result.ok) return { error: result.error ?? "It didn't go, and gave no reason." };
  return { notice: "Sent." };
}

/**
 * Take a month back to draft.
 *
 * Kept because publishing a month with a wrong figure in it is a thing that
 * will happen, and the alternative to an unpublish button is editing the
 * database by hand. Admin only, same as publishing.
 */
export async function unpublishMonth(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const reportUser = await requireReportUser();
  if (!reportUser.isAdmin) return { error: "Only Nina can unpublish a report." };

  const workspaceId = String(formData.get("workspace_id") ?? "");
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!workspaceId || !month) return { error: "That was missing something." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("report_periods")
    .update({ published_at: null, published_by: null })
    .eq("workspace_id", workspaceId)
    .eq("month", month);

  if (error) return { error: `Couldn't unpublish: ${error.message}` };

  revalidatePath("/reporting", "layout");
  return { notice: "Back to draft. The client can no longer see this month." };
}
