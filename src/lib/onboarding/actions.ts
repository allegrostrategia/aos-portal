"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { ownsHeadshotPath } from "@/lib/directory/headshot";
import { AUDIT_QUESTIONS, scoreAudit } from "./audit-questions";

export type OnboardingFormState = {
  error?: string;
  notice?: string;
} | null;

/**
 * Mark the welcome session watched — the gate the audit form sits behind (§1).
 *
 * Light-touch by design: no quiz, no watch-time tracking. It records sequence,
 * not proof, and pretending otherwise would mean policing a video player.
 */
export async function markWelcomeWatched(): Promise<void> {
  const member = await requireMember();

  // Idempotent: re-watching shouldn't move the timestamp, which is the record of
  // when they first arrived.
  if (!member.welcome_session_watched_at) {
    const supabase = await createClient();
    await supabase
      .from("members")
      .update({ welcome_session_watched_at: new Date().toISOString() })
      .eq("id", member.id);
  }

  revalidatePath("/onboarding");
  redirect("/onboarding");
}

/**
 * Submit the onboarding audit.
 *
 * Scores are computed here and stored alongside the raw answers, so a later
 * change to the question set doesn't silently rewrite an existing diagnosis.
 */
export async function submitAudit(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const member = await requireMember();

  const answers: Record<string, string> = {};
  for (const question of AUDIT_QUESTIONS) {
    const value = formData.get(question.id);
    if (typeof value === "string" && value) answers[question.id] = value;
  }

  const unanswered = AUDIT_QUESTIONS.filter((q) => !answers[q.id]);
  if (unanswered.length > 0) {
    return {
      error: `${unanswered.length} question${
        unanswered.length === 1 ? " is" : "s are"
      } still unanswered — the roadmap is only as good as this is.`,
    };
  }

  const { scores, weakestStationSlug, weakestBucket } = scoreAudit(answers);

  const supabase = await createClient();
  const { error } = await supabase.from("member_audits").insert({
    member_id: member.id,
    occasion: "onboarding",
    answers,
    scores,
    weakest_station_slug: weakestStationSlug,
    weakest_bucket: weakestBucket,
    submitted_at: new Date().toISOString(),
  });

  if (error) {
    return { error: `Couldn't save your answers: ${error.message}` };
  }

  revalidatePath("/onboarding");
  redirect("/onboarding?done=audit");
}

/**
 * Save the member directory listing — a required onboarding task (§10), not
 * optional-whenever.
 */
export async function saveDirectoryListing(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const member = await requireMember();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();

  if (!displayName) {
    return { error: "Add the name you'd like other members to see." };
  }
  if (!bio) {
    return { error: "A short bio is what makes the directory worth searching." };
  }

  // Up to three ways to work with them. Blank rows are dropped rather than
  // stored as empty objects.
  const links = [0, 1, 2]
    .map((i) => ({
      label: String(formData.get(`link_label_${i}`) ?? "").trim(),
      url: String(formData.get(`link_url_${i}`) ?? "").trim(),
    }))
    .filter((link) => link.url);

  const badUrl = links.find((link) => !/^https?:\/\//i.test(link.url));
  if (badUrl) {
    return {
      error: `“${badUrl.url}” doesn't look like a link — include the https:// at the front.`,
    };
  }

  // The path arrives from the browser and ends up in a row every other member
  // reads. The storage policy already stops anyone writing outside their own
  // prefix, but nothing stopped a listing *claiming* somebody else's photo —
  // the same small forgery the voice-message path guards against.
  const headshotPath = String(formData.get("headshot_path") ?? "").trim();
  if (headshotPath && !ownsHeadshotPath(member.id, headshotPath)) {
    return { error: "That photo isn't yours to use." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("member_profiles").upsert(
    {
      member_id: member.id,
      display_name: displayName,
      title: title || null,
      bio,
      links,
      headshot_path: headshotPath || null,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "member_id" },
  );

  if (error) {
    return { error: `Couldn't save your profile: ${error.message}` };
  }

  revalidatePath("/onboarding");
  redirect("/onboarding?done=directory");
}
