import type { Metadata } from "next";
import Link from "next/link";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import type { MemberProfile } from "@/lib/supabase/types";
import { PageHeader } from "@/components/ui/card";
import { DirectoryForm } from "./directory-form";

export const metadata: Metadata = {
  title: "Your directory listing — aOS",
};

/**
 * §10: filling this in is a required onboarding task, not optional-whenever.
 *
 * Built from its own dedicated prompt rather than assembled from audit answers —
 * what someone wants the membership to know about them isn't the same as what
 * they told Nina about their business.
 */
export default async function DirectoryListingPage() {
  const member = await requireMember();

  const supabase = await createClient();
  const { data } = await supabase
    .from("member_profiles")
    .select("*")
    .eq("member_id", member.id)
    .maybeSingle();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Piazza Sociale"
        title="Your directory listing"
        intro="What would you like your listing to say about you? A short bio, the key ways to work with you, and links. Other members can search this — nothing else about you is visible to them."
      />

      <DirectoryForm
        profile={(data as MemberProfile | null) ?? null}
        fallbackName={member.full_name}
      />

      {/* Headshots need file upload and a storage bucket, which doesn't exist
          yet — flagged rather than quietly dropped from §10's field list. */}
      <p className="mt-6 text-small text-navy/60">
        Photos come next — the upload needs a storage bucket that isn&rsquo;t set
        up yet. Your listing works without one in the meantime.
      </p>

      <p className="mt-8">
        <Link
          href="/onboarding"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← Back to your first weeks
        </Link>
      </p>
    </main>
  );
}
