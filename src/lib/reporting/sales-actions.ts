"use server";

import { revalidatePath } from "next/cache";

import { requireReportUser } from "@/lib/auth/report";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "./access.ts";
import { fromInputValue } from "./format.ts";
import { getWorkspace } from "./queries.ts";

/**
 * The two grids' writes, and the rows down the side of them.
 *
 * Nina, 13 November: the screen is for entering numbers. So there are
 * three actions and no verbs — a row, a grid of money received, a grid of
 * money expected. No sale, no schedule, no cancellation, no retiring.
 *
 * **Every refusal the database can make is phrased here.** The guards say
 * things like "That month is published. Unpublish it to make changes",
 * which is true and is not a sentence anybody should meet cold; and a
 * failed write that reports nothing is the day-7 pairing flag again.
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
 * A guard's wording, turned into something a person can act on.
 *
 * The guards are written for whoever reads the migration; this is for
 * whoever is looking at the screen. Anything unrecognised goes through as
 * it is rather than being flattened into "something went wrong" — a
 * message nobody can act on is worse than one that is too technical.
 */
function explain(message: string, fallback: string): string {
  if (/that month is published/i.test(message)) {
    return "That month is published, so its figures are fixed. Unpublish it to make changes.";
  }
  if (/has figures in a published month/i.test(message)) {
    return "That row has figures in a published month, so what kind of row it is can't change. Unpublish the month first.";
  }
  if (/duplicate key|unique/i.test(message)) return fallback;
  return `${fallback} ${message}`;
}

// ---------------------------------------------------------------------------
// The rows down the left-hand side
// ---------------------------------------------------------------------------

const RECURRENCE = new Set(["none", "monthly", "annual"]);

/**
 * Add a row, or change one.
 *
 * A row is named by the client: an offer they sell lots of gets a row
 * under the offer's name, and anybody on a retainer or a bespoke package
 * gets one under their own (Nina, 11 November). Linking to an offer is
 * optional, and only an offer row can have one.
 *
 * `recurrence` here is **the default for new cells**, not a fact about the
 * ones already saved — each cell of the Actual grid keeps its own copy, so
 * changing this never touches a month that has been published.
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
  const recurrence = String(formData.get("recurrence") ?? "none");

  if (!name) return { error: "A row needs a name — the offer, or the client." };
  if (rowType !== "offer" && rowType !== "client") {
    return { error: "A row is either an offer or a client." };
  }
  if (offerId && rowType !== "offer") {
    return { error: "Only an offer row can be linked to an offer." };
  }
  if (!RECURRENCE.has(recurrence)) {
    return { error: "A row recurs monthly, annually, or not at all." };
  }

  const supabase = await createClient();
  const fields = {
    workspace_id: workspaceId,
    name,
    row_type: rowType,
    offer_entity_id: offerId || null,
    recurrence,
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

// ---------------------------------------------------------------------------
// The grids
// ---------------------------------------------------------------------------

/** A cell, posted as `cell:<row id>:<month>`. */
const CELL = /^cell:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/;

interface Posted {
  sales_row_id: string;
  month: string;
  amount: number | null;
}

/**
 * Read a grid off the form.
 *
 * **An empty cell is not a figure of zero**, and the difference carries
 * all the way to the report: a month nobody typed into prints a dash. So
 * an empty cell is a row to remove, not a row to write — and it is
 * reported as `null` rather than dropped, because the save has to know
 * the difference between "cleared" and "not on screen".
 */
function readGrid(formData: FormData): Posted[] {
  const out: Posted[] = [];
  for (const [field, raw] of formData.entries()) {
    const match = CELL.exec(field);
    if (!match) continue;
    out.push({
      sales_row_id: match[1],
      month: match[2],
      amount: fromInputValue(String(raw)),
    });
  }
  return out;
}

async function saveGrid(
  table: "report_actuals" | "report_forecasts",
  formData: FormData,
  what: string,
): Promise<SalesState> {
  const workspaceId = String(formData.get("workspace_id") ?? "");
  const access = await editableWorkspace(workspaceId);
  if ("error" in access) return access;

  const posted = readGrid(formData);
  if (posted.length === 0) return { notice: "Nothing to save." };

  const supabase = await createClient();
  const filled = posted.filter((c) => c.amount !== null);
  const cleared = posted.filter((c) => c.amount === null);

  if (filled.length > 0) {
    const { error } = await supabase.from(table).upsert(
      filled.map((c) => ({
        workspace_id: workspaceId,
        sales_row_id: c.sales_row_id,
        month: c.month,
        amount: c.amount,
      })),
      { onConflict: "workspace_id,sales_row_id,month" },
    );
    if (error) return { error: explain(error.message, `Couldn't save ${what}.`) };
  }

  // Cleared cells go, one month at a time: the pair (row, month) is the
  // key, and a single `in` cannot express a list of pairs.
  for (const cell of cleared) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("sales_row_id", cell.sales_row_id)
      .eq("month", cell.month);
    if (error) return { error: explain(error.message, `Couldn't clear a cell of ${what}.`) };
  }

  revalidatePath("/reporting", "layout");
  return { notice: "Saved." };
}

/**
 * Money received: the whole grid in one save.
 *
 * One save because that is the job — the bank statement and Stripe are
 * open and they are typing down a column, not opening one row at a time.
 *
 * `recurrence` is not posted. The trigger fills each new cell from its
 * row, and a cell already saved keeps what it had, so a row ticked
 * recurring in April leaves January alone.
 */
export async function saveActuals(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  return saveGrid("report_actuals", formData, "what came in");
}

/**
 * Money expected: the same grid, for the months ahead.
 *
 * Nothing in here is generated. A retainer runs across six months because
 * somebody typed or pasted it across six months.
 */
export async function saveForecasts(
  _prev: SalesState,
  formData: FormData,
): Promise<SalesState> {
  return saveGrid("report_forecasts", formData, "the forecast");
}
