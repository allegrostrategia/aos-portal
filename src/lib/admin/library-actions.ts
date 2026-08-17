"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";

export type LibraryState = { error?: string; notice?: string } | null;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

  const { error } = id
    ? await supabase.from("training_content").update(payload).eq("id", id)
    : await supabase.from("training_content").insert(payload);

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return { error: `Something already uses the slug "${payload.slug}".` };
    }
    return { error: `Couldn't save: ${error.message}` };
  }

  revalidatePath("/", "layout");
  return {
    notice: payload.published_at
      ? "Saved and published."
      : "Saved as a draft — members can't see it until it's published.",
  };
}
