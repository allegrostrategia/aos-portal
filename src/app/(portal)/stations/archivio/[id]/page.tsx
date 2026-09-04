import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/member";
import { getArchivioEntry } from "@/lib/sop/queries";
import { isComplete, missingFrom } from "@/lib/sop/template";
import { deleteSop } from "@/lib/sop/actions";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SopForm } from "../sop-form";
import { WriteUpEditor } from "./write-up-editor";

export const metadata: Metadata = { title: "Archivio — aOS" };

/**
 * One entry.
 *
 * An SOP the member wrote is editable in place — it's theirs. A write-up of a
 * hot seat build is shown as prose: §8 has Nina writing those, and the member
 * able to rephrase their own copy, which is a different screen and not this one.
 */
export default async function ArchivioEntryPage({
  params,
}: PageProps<"/stations/archivio/[id]">) {
  const member = (await getCurrentMember())!;
  const { id } = await params;

  const entry = await getArchivioEntry(member.id, id);
  if (!entry) notFound();

  const sop = entry.sop;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href="/stations/archivio"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← Archivio
        </Link>
      </p>

      <PageHeader
        eyebrow={entry.source === "member_sop" ? "Your SOP" : "Built together"}
        title={entry.title}
        intro={
          sop && !isComplete(sop)
            ? `Still to add: ${missingFrom(sop).join(", ")}.`
            : undefined
        }
      />

      {sop ? (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            {/* §11: SOPs are the only exportable thing in the product. */}
            <ButtonLink href={`/stations/archivio/${entry.id}/print`}>
              Save as PDF
            </ButtonLink>
          </div>

          <SopForm id={entry.id} title={entry.title} sop={sop} />

          {/* Two steps, no JavaScript — the same shape as deleting library
              content. A first draft somebody decided against is theirs to
              remove; rule 6 protects the record of their membership, not a
              process they thought better of. */}
          <details className="mt-6">
            <summary className="cursor-pointer list-none text-caption text-navy/40 transition hover:text-navy">
              Remove this SOP
            </summary>
            <form action={deleteSop} className="mt-2">
              <input type="hidden" name="id" value={entry.id} />
              <button
                type="submit"
                className="rounded-md border border-orange/40 px-2 py-1 text-caption text-navy transition hover:bg-blush/20"
              >
                Delete &ldquo;{entry.title}&rdquo; permanently
              </button>
            </form>
          </details>
        </>
      ) : (
        <Card>
          <Eyebrow>Written up after your hot seat</Eyebrow>
          {entry.confirmed_at ? (
            /* §8: the member can rephrase their own copy. A trigger keeps that
               to the prose — the title and who signed it off stay Nina's. */
            <div className="mt-3">
              <WriteUpEditor id={entry.id} body={entry.body ?? ""} />
            </div>
          ) : (
            <p className="mt-2 text-small text-navy/70">
              Nina hasn&rsquo;t written this one up yet. It&rsquo;ll appear here
              when she has — the build itself is already counting towards your
              hours.
            </p>
          )}
        </Card>
      )}
    </main>
  );
}
