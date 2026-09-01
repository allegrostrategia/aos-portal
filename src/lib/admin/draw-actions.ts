"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type DrawState = { error?: string; notice?: string } | null;

/**
 * Running the monthly draw (§2).
 *
 * Three moves, deliberately separate: set the draw up, lock the entrant list,
 * then draw. Nina can do the first two well before the draw date, and the gap
 * between locking and drawing is where the entrant list stops being a live query
 * and becomes a record.
 *
 * The rules themselves live in the database — `open_draw_entries()` and
 * `draw_winner()`. These actions are the buttons, not the logic. In particular
 * the refusals below are the database's own words, because the checks that
 * matter (already drawn, nobody entered) have to hold against a double-click,
 * which no amount of UI guarding can promise.
 */

export async function createDraw(
  _prev: DrawState,
  formData: FormData,
): Promise<DrawState> {
  await requireAdmin();

  // <input type="month"> gives "2026-02"; draws are keyed to the first of it.
  const month = String(formData.get("draw_month") ?? "").trim();
  const prize = String(formData.get("prize") ?? "").trim();
  const drawDate = String(formData.get("draw_date") ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Pick the month it's for." };
  if (!prize) return { error: "Say what the prize is." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) {
    return { error: "Pick the date it gets drawn." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("draws").insert({
    draw_month: `${month}-01`,
    prize,
    draw_date: drawDate,
  });

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: "There's already a draw for that month." };
    }
    return { error: `Couldn't set that up: ${error.message}` };
  }

  revalidatePath("/admin/draw");
  return { notice: "Draw set up. Open entries when the month is over." };
}

/**
 * Both of the buttons on a draw, in one action.
 *
 * One action rather than two so a single `useActionState` carries the result of
 * whichever was pressed — with two, a page holding several draws would need a
 * state per draw per button to say which one refused and why.
 */
export async function runDrawStep(
  _prev: DrawState,
  formData: FormData,
): Promise<DrawState> {
  await requireAdmin();

  const drawId = String(formData.get("draw_id") ?? "").trim();
  const intent = String(formData.get("intent") ?? "");
  if (!drawId) return { error: "Which draw?" };

  const supabase = await createClient();

  if (intent === "open") {
    const { data, error } = await supabase.rpc("open_draw_entries", {
      p_draw_id: drawId,
    });

    if (error) return { error: cleanError(error.message) };

    const added = Number(data ?? 0);
    revalidatePath("/admin/draw");

    if (added > 0) {
      return { notice: `${added} ${added === 1 ? "member" : "members"} entered.` };
    }

    // Nothing added has two very different meanings, and saying the wrong one
    // sends Nina looking for a bug: either everyone eligible was already in, or
    // nobody cleared the bar this month. Ask which.
    const { count } = await supabase
      .from("draw_entries")
      .select("id", { count: "exact", head: true })
      .eq("draw_id", drawId);

    return {
      notice:
        (count ?? 0) > 0
          ? "Nobody new — everyone eligible was already entered."
          : "Nobody completed the whole month, so there's nobody to enter yet.",
    };
  }

  if (intent === "draw") {
    const { error } = await supabase.rpc("draw_winner", { p_draw_id: drawId });
    if (error) return { error: cleanError(error.message) };

    revalidatePath("/admin/draw");
    return { notice: "Drawn. The winner is on the card." };
  }

  return { error: "Unknown step." };
}

/**
 * Postgres prefixes its own raise with context the admin panel shouldn't show.
 * The message itself is written to be read by Nina, so it's kept.
 */
function cleanError(message: string): string {
  return message.replace(/^.*?(?:ERROR|error):\s*/i, "").trim() || message;
}
