import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_QUESTIONS } from "@/lib/onboarding/audit-questions";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { AuditForm } from "./audit-form";

export const metadata: Metadata = {
  title: "Your audit — aOS",
};

export default async function AuditPage() {
  const member = await requireMember();

  // §1: the audit unlocks once the welcome session has been watched. Enforced
  // here rather than only hidden on the hub — the URL is guessable.
  if (!member.welcome_session_watched_at) {
    redirect("/onboarding/welcome");
  }

  const supabase = await createClient();

  const [{ data: stationRows }, { data: existing }] = await Promise.all([
    supabase.from("stations").select("slug, name"),
    supabase
      .from("member_audits")
      .select("id, submitted_at")
      .eq("member_id", member.id)
      .eq("occasion", "onboarding")
      .not("submitted_at", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);

  const stationNames = Object.fromEntries(
    ((stationRows ?? []) as { slug: string; name: string }[]).map((s) => [
      s.slug,
      s.name,
    ]),
  );

  if (existing) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
        <PageHeader eyebrow="Grand Hotel Riposo" title="Your audit" />
        <Card>
          <Eyebrow>Submitted</Eyebrow>
          <p className="mt-2 text-small text-navy/80">
            Your answers are in, and Nina has them ahead of your 1:1. The deeper
            questions happen live in that conversation rather than on a form.
          </p>
          <p className="mt-3 text-small text-navy/60">
            Changed your mind about an answer? Mention it on the call — it&rsquo;s
            a point-in-time snapshot, so it isn&rsquo;t edited after the fact.
          </p>
        </Card>
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

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Grand Hotel Riposo"
        title="Your audit"
        intro="Nine questions, one per part of the business. Answer for how things actually are rather than how you'd like them to be — this is what your roadmap gets built from, and a flattering picture only produces a roadmap for a business you don't have."
      />

      <AuditForm questions={AUDIT_QUESTIONS} stationNames={stationNames} />
    </main>
  );
}
