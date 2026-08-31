"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/library/assets";

export type LibraryState = { error?: string; notice?: string } | null;

/**
 * Drop a file from the bucket once nothing points at it.
 *
 * Not a contradiction of the never-delete rule: that protects a member's record
 * of their own work. This is Nina's own material, and the row it belonged to has
 * either gone or moved on to a different file. Left alone, every re-record would
 * strand its predecessor in the bucket forever, and the storage bill would be
 * the only thing that ever noticed.
 *
 * Best-effort on purpose — a failed cleanup leaves a stray file, which is much
 * cheaper than failing the save that already succeeded.
 */
async function removeAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string | null,
): Promise<void> {
  if (!path) return;
  await supabase.storage.from("training-content").remove([path]);
}

/**
 * Add or update a piece of library content (§7).
 *
 * The full tagging set in one place, because §6's two layers only work if both
 * are filled in: topic (bucket and sub-category) organises it, job (save-time or
 * make-money) is what the recommendation engine actually reads. A partially
 * tagged item browses fine and is invisible to the diagnostic.
 */
export async function saveContent(
  _prev: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const stationSlug = String(formData.get("station_slug") ?? "").trim();

  if (!title) return { error: "Give it a title." };
  if (!stationSlug) {
    return {
      error:
        "Pick a station. Every training lives in exactly one — that's the organising principle, not a tag.",
    };
  }

  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const duration = durationRaw ? Number(durationRaw) : null;
  if (duration !== null && (!Number.isFinite(duration) || duration < 0)) {
    return { error: "Duration should be a number of minutes, or blank." };
  }

  const payload = {
    title,
    slug: String(formData.get("slug") ?? "").trim() || slugify(title),
    description: String(formData.get("description") ?? "").trim() || null,
    station_slug: stationSlug,
    bucket: String(formData.get("bucket") ?? "").trim() || null,
    sub_category: String(formData.get("sub_category") ?? "").trim() || null,
    job: String(formData.get("job") ?? "").trim() || null,
    kind: String(formData.get("kind") ?? "training"),
    format: String(formData.get("format") ?? "video"),
    asset_path: String(formData.get("asset_path") ?? "").trim() || null,
    duration_minutes: duration,
    is_hot_seat_buildable: formData.get("is_hot_seat_buildable") === "on",
    available_during_onboarding:
      formData.get("available_during_onboarding") === "on",
    // Publishing is the deliberate act. Uploading something shouldn't put it in
    // front of members by accident.
    published_at:
      formData.get("published") === "on" ? new Date().toISOString() : null,
    sort_order: Number(String(formData.get("sort_order") ?? "0")) || 0,
  };

  const supabase = await createClient();

  const previousAssetPath = id
    ? (
        (
          await supabase
            .from("training_content")
            .select("asset_path")
            .eq("id", id)
            .maybeSingle()
        ).data as { asset_path: string | null } | null
      )?.asset_path ?? null
    : null;

  const { error } = id
    ? await supabase.from("training_content").update(payload).eq("id", id)
    : await supabase.from("training_content").insert(payload);

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return { error: `Something already uses the slug "${payload.slug}".` };
    }
    return { error: `Couldn't save: ${error.message}` };
  }

  // Only after the row is safely saved: if the update had failed, the old file
  // is still the live one.
  if (previousAssetPath && previousAssetPath !== payload.asset_path) {
    await removeAsset(supabase, previousAssetPath);
  }

  revalidatePath("/", "layout");
  return {
    notice: payload.published_at
      ? "Saved and published."
      : "Saved as a draft — members can't see it until it's published.",
  };
}

/**
 * Publish or unpublish, without touching anything else.
 *
 * The everyday correction: something went out too early, or a training is being
 * re-recorded. Unpublishing hides it from members and keeps the row, its tags
 * and its slug — so putting it back is one click rather than retyping the lot.
 */
export async function togglePublished(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const publish = formData.get("publish") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("training_content")
    .update({ published_at: publish ? new Date().toISOString() : null })
    .eq("id", id);

  revalidatePath("/", "layout");
}

/**
 * Remove a piece of content outright.
 *
 * Genuinely deletes, unlike everything touching member data — this is Nina's own
 * material, not somebody's record of their work, so a duplicate or a mistyped
 * entry is worth removing rather than keeping forever. Unpublishing is the
 * gentler option and the one to reach for when a member might have seen it.
 */
export async function deleteContent(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();

  const { data } = await supabase
    .from("training_content")
    .select("asset_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("training_content").delete().eq("id", id);
  if (error) return;

  await removeAsset(supabase, (data as { asset_path: string | null } | null)?.asset_path ?? null);

  revalidatePath("/", "layout");
}
