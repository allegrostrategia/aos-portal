import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/member";
import { checkInviteReadiness } from "@/lib/admin/diagnostics";
import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/supabase/types";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = {
  title: "Members — aOS admin",
};

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const STATUS_LABEL: Record<Member["status"], string> = {
  onboarding: "Onboarding",
  active: "Active",
  cancelled: "Cancelled",
};

/**
 * The first slice of the admin panel (Build Brief §7). The full unified panel —
 * content upload, hot seat review, running the draw — is Step 8; this is the part
 * that had to come first, because nobody can be onboarded without it.
 */
export default async function AdminMembersPage() {
  await requireAdmin();

  const supabase = await createClient();
  // RLS returns every member here because is_portal_admin() is true.
  const { data } = await supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: false });

  const members = (data ?? []) as Member[];
  const today = new Date().toISOString().slice(0, 10);
  const readiness = await checkInviteReadiness();

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader eyebrow="Admin" title="Members" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <Card>
          <h2 className="font-display mb-1 text-heading text-navy italic">
            Invite a member
          </h2>
          <p className="mb-5 text-small text-navy/70">
            Sends an invitation email and creates their record. This is what
            starts onboarding.
          </p>

          {/* Shown only when something would stop an invitation working — no
              point decorating a healthy page with green ticks. */}
          {readiness.some((check) => !check.ok) ? (
            <div className="mb-5 rounded-md border border-orange/30 bg-blush/20 p-3">
              <p className="text-small font-medium text-navy">
                Invitations aren&rsquo;t ready yet
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {readiness
                  .filter((check) => !check.ok)
                  .map((check) => (
                    <li key={check.label} className="text-caption text-navy/80">
                      <span className="font-medium">{check.label}:</span>{" "}
                      {check.detail}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <InviteForm today={today} />
        </Card>

        <section>
          <h2 className="font-display mb-3 text-heading text-navy italic">
            Everyone ({members.length})
          </h2>

          {members.length === 0 ? (
            <Card>
              <p className="text-small text-navy/70">No members yet.</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id}>
                  <Link
                    href={`/admin/members/${member.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-navy/10 bg-white/60 px-4 py-3 transition hover:border-navy/25"
                  >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy">
                      {member.full_name}
                      {member.role === "admin" ? (
                        <span className="ml-2">
                          <Badge tone="gold">Admin</Badge>
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-small text-navy/60">{member.email}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-small text-navy/80">
                      {STATUS_LABEL[member.status]}
                    </p>
                    <p className="font-mono text-caption text-navy/50">
                      joined {DATE.format(new Date(member.join_date))}
                    </p>
                  </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
