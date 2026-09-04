"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { readPriorities } from "./shape";

export type RevealState = { error?: string; notice?: string } | null;

/**
 * Write a member's reveal document (§1, Step 12).
 *
 * Nina works the words out with Claude outside the product and puts them here.
 * Nothing drafts anything — what the app contributes is the document: the same
 * structure and the same type system for every member, so it reads as the first
 * page of aOS rather than as whatever survived being edited by hand.
 *
 * Saving a half-written one is allowed. This gets filled in over a couple of
 * sittings after a call, and a form that refuses until it's complete is a form
 * somebody abandons with the good phrasing still in their notes.
 */
export async function saveReveal(
  _prev: RevealState,
  formData: FormData,
): Promise<RevealState> {
  await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  if (!memberId) return { error: "Which member?" };

  // Repeated fields arrive in document order, which is the order they'll be
  // numbered on the page.
  const titles = formData.getAll("priority_title").map(String);
  const bodies = formData.getAll("priority_body").map(String);
  const priorities = readPriorities(
    titles.map((title, index) => ({ title, body: bodies[index] ?? "" })),
  );

  const text = (name: string) => String(formData.get(name) ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("roadmap_reveals").upsert(
    {
      member_id: memberId,
      baseline: text("baseline"),
      starts_on: text("starts_on"),
      in_their_words: text("in_their_words"),
      whats_working: text("whats_working"),
      whats_not_working: text("whats_not_working"),
      priorities,
      road_note: text("road_note"),
    },
    { onConflict: "member_id" },
  );

  if (error) return { error: `Couldn't save that: ${error.message}` };

  revalidatePath("/admin/reveal");
  return { notice: "Saved." };
}
