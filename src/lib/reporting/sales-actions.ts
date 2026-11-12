"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "./access.ts";
import { fromInputValue } from "./format.ts";
import { firstOfMonth } from "./months.ts";
import { getWorkspace } from "./queries.ts";

/**
 * The sales ledger's writes: the rows, the sales, the instalments.
 *
 * Nina's tracker is one row per offer or per customer with instalments
 * written across it, so three shapes of write rather than one form of
 * figures — a row is set up once, a sale happens in a month, and its
 * instalments are cells in later months.
 *
 * **Every refusal the database can make is phrased here.** The guards say
 * things like "That month is published. Only a cancellation can still be
 * recorded", which is true and is not a sentence anybody should meet
 * cold; and a failed write that reports nothing is the day-7 pairing
 * flag again.
 */

export type SalesState = { error?: string; notice?: string } | null;

async function editableWorkspace(workspaceId: string) {
  const reportUser = await requireReportUser();
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { error: "You don't have access to that client." } as const;

  const grant = reportUser.grants.find((g) => g.workspace_id === workspaceId);
  const mayEdit = canEdit({
    role: grant?.role ?? null,
    kind: workspace.kind,
    isAdmin: reportUser.isAdmin,
  });

  if (!mayEdit) {
    return { error: "Your report is filled in by your Allegro team." } as const;
  }
  return { reportUser, workspace } as const;
}

/**
 * Turn a guard's wording into something a person can act on.
 *
 * The guards are written for whoever reads the migration; this is written
 * for whoever is looking at the screen. Anything unrecognised goes through
 * as it is rather than being flattened into "something went wrong" —
 * a message nobody can act on is worse than one that is too technical.
 */
function explain(message: string, fallback: string): string {
  if (/only a cancellation can still be recorded/i.test(message)) {
    return "That month is published, so what was sold is fixed. Unpublish it to make a change, or record a cancellation instead.";
  }
  if (/a cancellation can only be dated in a month that is still open/i.test(message)) {
    return "A cancellation has to be dated in a month that hasn't been published yet. Pick a later month, or unpublish the ones after it.";
  }
  if (/only when the money arrived/i.test(message)) {
    return "That month is published, so the instalment is fixed. You can still record when the money arrived, or that it was cancelled.";
  }
  if (/when the money arrived/i.test(message)) {
    return "That month is published, so its cash is fixed. Unpublish it to move money in or out.";
  }
  if (/that month is published/i.test(message)) {
    return "That month is published. Unpublish it to make changes.";
  }
  if (/duplicate key|unique/i.test(message)) return fallback;
  return `${fallback} ${message}`;
}

// ---------------------------------------------------------------------------
// The rows down the left-hand side
// ---------------------------------------------------------------------------

/**
 * Add a row, or change one.
 *
 * A row is named by the client: an offer they sell lots of gets a row
 * under the offer's name, and anybody on a retainer or a bespoke package
 * gets one under their own (Nina, 11 November). Linking to an offer is
 * optional, and only an offer row can have one.
 */
export async function saveSalesRow(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("row_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const rowType = String(formData.get("row_type") ?? "");
  const offerId = String(formData.get("offer_entity_id") ?? "").trim();

  if (!name) return { error: "A row needs a name — the offer, or the client." };
  if (rowType !== "offer" && rowType !== "client") {
    return { error: "A row is either an offer or a client." };
  }
  if (offerId && rowType !== "offer") {
    return { error: "Only an offer row can be linked to an offer." };
  }

  const supabase = await createClient();
  const fields = {
    workspace_id: workspaceId,
    name,
    row_type: rowType,
    offer_entity_id: offerId || null,
  };

  const { error } = id
    ? await supabase.from("report_sales_rows").update(fields).eq("id", id)
    : await supabase.from("report_sales_rows").insert({
        ...fields,
        // New rows go to the bottom of the grid, which is where somebody
        // adding one is looking.
        sort_order: await nextSortOrder(supabase, workspaceId),
      });

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: `There is already a row called "${name}".` };
    }
    return { error: explain(error.message, "Couldn't save the row.") };
  }

  revalidatePath("/reporting", "layout");
  return { notice: id ? `${name} updated.` : `${name} added.` };
}

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<number> {
  const { data } = await supabase
    .from("report_sales_rows")
    .select("sort_order")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .returns<{ sort_order: number }[]>();
  return (data?.[0]?.sort_order ?? 0) + 1;
}

/**
 * Retire a row.
 *
 * `active = false`, never a delete (rule 7): last year's figures are what
 * they are because of the client who left, and the row is what says so.
 */
export async function retireSalesRow(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const id = String(formData.get("row_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const active = formData.get("active") === "true";
  if (!id) return { error: "Couldn't tell which row that was." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("report_sales_rows")
    .update({ active })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) return { error: explain(error.message, "Couldn't change the row.") };

  revalidatePath("/reporting", "layout");
  return { notice: active ? `${name} is back in the grid.` : `${name} retired.` };
}

// ---------------------------------------------------------------------------
// A sale, and the instalments it schedules
// ---------------------------------------------------------------------------

/** One cell of the schedule, posted as `due:2026-10-01` and `paid:2026-10-01`. */
const DUE_FIELD = /^due:(\d{4}-\d{2}-\d{2})$/;

interface Instalment {
  due_month: string;
  amount: number;
  received_month: string | null;
}

/**
 * Read the schedule off the form.
 *
 * A cell left empty is not an instalment, so it is dropped rather than
 * stored as zero — an empty cell in her grid means "nothing due that
 * month", and a row of £0s would be a schedule that says something else.
 */
function readSchedule(formData: FormData): Instalment[] {
  const out: Instalment[] = [];
  for (const [field, raw] of formData.entries()) {
    const match = DUE_FIELD.exec(field);
    if (!match) continue;
    const amount = fromInputValue(String(raw));
    if (amount === null) continue;
    const month = match[1];
    out.push({
      due_month: month,
      amount,
      // The checkbox posts the month it was paid in, so money that arrived
      // late can say so. Absent means it has not come in.
      received_month: firstOfMonth(String(formData.get(`paid:${month}`) ?? "")) ?? null,
    });
  }
  return out.sort((a, b) => a.due_month.localeCompare(b.due_month));
}

/**
 * Record a sale, or change one, with its whole schedule in one save.
 *
 * One save, because a sale and its instalments are one thing somebody is
 * entering: four separate writes is four chances to leave the last one
 * behind, and a sale with half a schedule is the "£500 not yet scheduled"
 * line on the screen rather than anything the database refuses.
 *
 * The instalments are replaced rather than merged. The schedule on the
 * form IS the schedule — a cell somebody cleared has to disappear, and a
 * merge would leave it behind for ever.
 */
export async function saveSale(_prev: SalesState, formData: FormData): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const saleId = String(formData.get("sale_id") ?? "").trim();
  const rowId = String(formData.get("sales_row_id") ?? "").trim();
  const month = firstOfMonth(String(formData.get("month") ?? ""));
  const totalValue = fromInputValue(String(formData.get("total_value") ?? ""));
  const billing = String(formData.get("billing") ?? "one_off");

  if (!rowId) return { error: "Pick which row this sale belongs to." };
  if (!month) return { error: "Couldn't tell which month that sale was in." };
  if (totalValue === null) return { error: "A sale needs a value." };
  if (totalValue < 0) return { error: "A sale cannot be worth less than nothing." };
  if (billing !== "one_off" && billing !== "monthly" && billing !== "annual") {
    return { error: "A sale is billed once, monthly or annually." };
  }

  const schedule = readSchedule(formData);
  if (schedule.some((i) => i.amount < 0)) {
    return { error: "An instalment cannot be less than nothing." };
  }

  const supabase = await createClient();
  const fields = {
    workspace_id: workspaceId,
    sales_row_id: rowId,
    month,
    total_value: totalValue,
    billing,
  };

  let id = saleId;
  if (id) {
    const { error } = await supabase
      .from("report_sales")
      .update(fields)
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) return { error: explain(error.message, "Couldn't save the sale.") };
  } else {
    const { data, error } = await supabase
      .from("report_sales")
      .insert(fields)
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error || !data) {
      return { error: explain(error?.message ?? "", "Couldn't record the sale.") };
    }
    id = data.id;
  }

  // Clear the cells that are no longer in the schedule, and do it before
  // the upsert so a cell moved from October to November does not trip the
  // one-instalment-per-month rule.
  //
  // Worked out from what is stored rather than from what the form says was
  // there: a form that disagrees with the database is a form that deletes
  // something it was not looking at.
  const keep = new Set(schedule.map((i) => i.due_month));
  const { data: existing, error: readError } = await supabase
    .from("report_sale_payments")
    .select("due_month")
    .eq("workspace_id", workspaceId)
    .eq("sale_id", id)
    .returns<{ due_month: string }[]>();
  if (readError) {
    return { error: explain(readError.message, "Couldn't read the instalments back.") };
  }

  const removed = (existing ?? [])
    .map((r) => r.due_month.slice(0, 10))
    .filter((m) => !keep.has(m));

  if (removed.length > 0) {
    // **Checked against what came back, not against the error.** A delete
    // refused by RLS is a success with no error and no rows — the trap
    // this codebase has already paid for twice — so the only honest test
    // is whether the rows went. `.select()` makes the delete say.
    const { data: went, error } = await supabase
      .from("report_sale_payments")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("sale_id", id)
      .in("due_month", removed)
      .select("due_month")
      .returns<{ due_month: string }[]>();

    const left = removed.filter(
      (m) => !(went ?? []).some((r) => r.due_month.slice(0, 10) === m),
    );

    // **Both failures get the same sentence**, because they are the same
    // thing to whoever is looking at the screen: the guard refuses the
    // delete out loud, and RLS refuses it silently, and in each case the
    // sale saved and the cell did not go.
    if (error || left.length > 0) {
      return {
        error:
          "The sale is saved, but an instalment in a published month couldn't be cleared. Unpublish that month, or mark it cancelled instead.",
      };
    }
  }

  if (schedule.length > 0) {
    const { error } = await supabase.from("report_sale_payments").upsert(
      schedule.map((i) => ({ workspace_id: workspaceId, sale_id: id, ...i })),
      { onConflict: "sale_id,due_month" },
    );
    if (error) return { error: explain(error.message, "Couldn't save the instalments.") };
  }

  revalidatePath("/reporting", "layout");
  return { notice: saleId ? "Sale updated." : "Sale recorded." };
}

/**
 * Mark a sale as cancelled, or take the mark off.
 *
 * Never a delete (rule 7): a £2,000 that fell through is a thing that
 * happened to the business, and the report should be able to say so.
 *
 * Dated in a month, because that is what makes it recordable at all — a
 * cancellation in November is news about November and leaves a published
 * September alone. The database refuses one dated at or before a
 * published month, which is why this offers a month rather than today's
 * date.
 */
export async function cancelSale(_prev: SalesState, formData: FormData): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const saleId = String(formData.get("sale_id") ?? "").trim();
  const on = firstOfMonth(String(formData.get("cancelled_on") ?? ""));
  const undo = formData.get("undo") === "true";
  if (!saleId) return { error: "Couldn't tell which sale that was." };
  if (!undo && !on) return { error: "Pick the month they stopped." };

  const supabase = await createClient();
  const cancelledOn = undo ? null : on;

  const { error } = await supabase
    .from("report_sales")
    .update({ cancelled_on: cancelledOn })
    .eq("id", saleId)
    .eq("workspace_id", workspaceId);
  if (error) return { error: explain(error.message, "Couldn't record the cancellation.") };

  // The instalments still to come go with it. The ones already paid do
  // not: that money arrived, and a month that counted it said so.
  const { error: restError } = await supabase
    .from("report_sale_payments")
    .update({ cancelled_on: cancelledOn })
    .eq("workspace_id", workspaceId)
    .eq("sale_id", saleId)
    .is("received_month", null);
  if (restError) {
    return {
      error: explain(restError.message, "The sale is marked, but its instalments are not."),
    };
  }

  revalidatePath("/reporting", "layout");
  return {
    notice: undo ? "Cancellation removed." : "Marked as cancelled, and kept on the record.",
  };
}

/**
 * The fast path: mark the money that came in this month.
 *
 * One form for the whole month's column, because that is the job — the
 * bank statement is open and they are ticking down a list, not opening
 * one sale at a time.
 */
export async function savePaymentsReceived(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const month = firstOfMonth(String(formData.get("month") ?? ""));
  if (!month) return { error: "Couldn't tell which month that was." };

  // `cell:<sale id>:<due month>` is ticked when the money is in.
  const ticked = new Set<string>();
  const offered = new Set<string>();
  for (const [field, raw] of formData.entries()) {
    const match = /^cell:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(field);
    if (!match) continue;
    offered.add(`${match[1]}|${match[2]}`);
    if (String(raw) === "on") ticked.add(`${match[1]}|${match[2]}`);
  }

  if (offered.size === 0) return { notice: "Nothing to change." };

  const supabase = await createClient();
  for (const cell of offered) {
    const [saleId, dueMonth] = cell.split("|");
    const { error } = await supabase
      .from("report_sale_payments")
      .update({ received_month: ticked.has(cell) ? month : null })
      .eq("workspace_id", workspaceId)
      .eq("sale_id", saleId)
      .eq("due_month", dueMonth);
    // Reported rather than counted: a refusal here is the published-month
    // guard saying the cash in that month is fixed, and that is the one
    // thing somebody ticking a list needs told.
    if (error) return { error: explain(error.message, "Couldn't save what came in.") };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Saved." };
}
