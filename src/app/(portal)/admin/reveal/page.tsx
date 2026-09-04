import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { getReveal } from "@/lib/reveal/queries";
import { EMPTY_REVEAL, isRevealComplete, missingFromReveal } from "@/lib/reveal/shape";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { RevealForm } from "./reveal-form";

export const metadata: Metadata = { title: "Reveal document — aOS admin" };

/**
 * The roadmap reveal document (§1, Step 12).
 *
 * **An admin tool, and not member-facing.** §1 hands this over at the end of the
 * 1:1 "before they even log into the portal", which is the whole reason it
 * exists as a document rather than a screen — and once they're in, La Strada is
 * the living version of the same thing.
 *
 * §1 described it as Claude-drafted and Nina-confirmed. It isn't any more: she
 * writes it with Claude outside the product. What the app contributes is the
 * document — one structure and one type system for every member, instead of
 * whatever survives being edited by hand each time.
 */
export default async function AdminRevealPage({
  searchParams,
}: PageProps<"/admin/reveal">) {
  await requireAdmin();
  const params = await searchParams;
  const selectedId = typeof params.member === "string" ? params.member : null;

  const supabase = await createClient();
  const { data: memberRows } = await supabase
    .from("members")
    .select("id, full_name, status")
    .eq("role", "member")
    .neq("status", "cancelled")
    .order("full_name");

  const members = (memberRows ?? []) as {
    id: string;
    full_name: string;
    status: string;
  }[];
  const selected = selectedId
    ? (members.find((m) => m.id === selectedId) ?? null)
    : null;

  const reveal = selected ? ((await getReveal(selected.id)) ?? EMPTY_REVEAL) : null;

  return (
    <main className="flex-1 py-8 sm:py-10">
      <PageHeader
        eyebrow="Admin"
        title="Reveal document"
        intro="What you hand over at the end of the 1:1, before they have a portal at all. Write it wherever you write it, then put it here so every member's reads like the first page of aOS."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Members">
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.id}>
                <Link
                  href={`/admin/reveal?member=${member.id}`}
                  aria-current={member.id === selectedId ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-small transition ${
                    member.id === selectedId
                      ? "bg-white/70 font-medium text-navy"
                      : "text-navy/70 hover:bg-white/40 hover:text-navy"
                  }`}
                >
                  {member.full_name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section>
          {!selected || !reveal ? (
            <Card>
              <p className="text-small text-navy/70">
                Pick somebody. Their reveal is written once, around their 1:1 —
                it&rsquo;s a snapshot of that conversation, not something that
                keeps up with their roadmap afterwards.
              </p>
            </Card>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-heading text-navy italic">
                  {selected.full_name}
                </h2>
                <div className="flex flex-wrap items-center gap-3">
                  {isRevealComplete(reveal) ? (
                    <Badge tone="sky">Ready to hand over</Badge>
                  ) : (
                    <Badge tone="gold">In progress</Badge>
                  )}
                  <ButtonLink
                    href={`/admin/reveal/${selected.id}/document`}
                    size="sm"
                  >
                    Open the document
                  </ButtonLink>
                </div>
              </div>

              {!isRevealComplete(reveal) ? (
                <Card className="mb-4 bg-lemon/25">
                  <p className="text-small text-navy/80">
                    Still to write: {missingFromReveal(reveal).join(", ")}.
                  </p>
                </Card>
              ) : null}

              <RevealForm memberId={selected.id} reveal={reveal} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
