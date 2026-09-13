import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/member";
import { getArchivioEntry, getArchivioImageUrl } from "@/lib/sop/queries";
import { EMPTY_SOP, isComplete, missingFrom } from "@/lib/sop/template";
import { deleteSop } from "@/lib/sop/actions";
import { Card, Eyebrow, PageHeader, Quote } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { SopForm } from "../sop-form";

export const metadata: Metadata = { title: "Archivio — aOS" };

/**
 * One entry.
 *
 * L'Editoriale §6 turned the hot-seat flow round: the member writes the SOP
 * for a build themselves, with Nina's comment beside the form, using the same
 * template as anything else they document. So this page is the same form for
 * both kinds of entry. The differences: a build keeps Nina's title, shows her
 * comment as guidance, and can't be deleted (it's a shared record of something
 * built together — rule 6); an SOP the member started is theirs entirely.
 *
 * Builds written up under the old flow still carry Nina's prose in `body`.
 * That is shown, read-only, above the form — nothing already published to
 * somebody's Archivio disappears because the process changed.
 */
export default async function ArchivioEntryPage({
  params,
}: PageProps<"/stations/archivio/[id]">) {
  const member = (await getCurrentMember())!;
  const { id } = await params;

  const entry = await getArchivioEntry(member.id, id);
  if (!entry) notFound();

  const isBuild = entry.source === "hot_seat";
  const sop = entry.sop ?? (isBuild ? EMPTY_SOP : null);
  const written = Boolean(entry.sop);

  // A template is a picture with a name: shown, and removable. No form.
  if (entry.source === "template") {
    const url = entry.image_path ? await getArchivioImageUrl(entry.image_path) : null;
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
        <p className="mb-4">
          <Link href="/stations/archivio?folder=templates" className="text-small text-ink/60 transition hover:text-ink">
            ← Templates
          </Link>
        </p>
        <PageHeader size="title" eyebrow="Template" title={entry.title} />
        <Card padded={false} className="overflow-hidden">
          {url ? (
            // Signed, hour-long URL — not next/image, which would cache a link
            // that stops working.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={entry.title} className="w-full bg-cream-deep object-contain" />
          ) : (
            <p className="p-6 text-small text-ink/60">The picture couldn&rsquo;t be loaded.</p>
          )}
        </Card>
        <details className="mt-6">
          <summary className="cursor-pointer list-none text-caption text-ink/40 transition hover:text-ink">
            Remove this template
          </summary>
          <form action={deleteSop} className="mt-2">
            <input type="hidden" name="id" value={entry.id} />
            <button
              type="submit"
              className="rounded-full border border-orange/40 px-3 py-1 text-caption text-ink transition hover:bg-blush/20"
            >
              Delete &ldquo;{entry.title}&rdquo; permanently
            </button>
          </form>
        </details>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <p className="mb-4">
        <Link
          href="/stations/archivio"
          className="text-small text-ink/60 transition hover:text-ink"
        >
          ← Archivio
        </Link>
      </p>

      <PageHeader
        size="title"
        eyebrow={isBuild ? "Built together" : "Your SOP"}
        title={entry.title}
        intro={
          sop && written && !isComplete(sop)
            ? `Still to add: ${missingFrom(sop).join(", ")}.`
            : isBuild && !written
              ? "Write up how this runs now it's built — the same template as any SOP, in your own words."
              : undefined
        }
      />

      {isBuild && entry.coach_note ? (
        <Card className="mb-6 bg-lemon/25">
          <Eyebrow tone="accent">From Nina</Eyebrow>
          <Quote className="mt-2 text-body">{entry.coach_note}</Quote>
        </Card>
      ) : null}

      {isBuild && entry.body ? (
        <Card className="mb-6">
          <Eyebrow>Nina&rsquo;s write-up</Eyebrow>
          <div className="mt-3 text-body whitespace-pre-wrap text-ink/85">{entry.body}</div>
          <p className="mt-3 text-caption text-ink/50">
            Written under the earlier process. Your own SOP for the build goes below.
          </p>
        </Card>
      ) : null}

      {sop ? (
        <>
          {written ? (
            <div className="mb-5 flex flex-wrap gap-3">
              {/* §11: SOPs are the only exportable thing in the product. */}
              <ButtonLink href={`/stations/archivio/${entry.id}/print`}>Save as PDF</ButtonLink>
            </div>
          ) : null}

          <SopForm id={entry.id} title={entry.title} sop={sop} lockTitle={isBuild} />

          {!isBuild ? (
            /* Two steps, no JavaScript — the same shape as deleting library
               content. A first draft somebody decided against is theirs to
               remove; rule 6 protects the record of their membership, not a
               process they thought better of. A build is a shared record and
               has no such option. */
            <details className="mt-6">
              <summary className="cursor-pointer list-none text-caption text-ink/40 transition hover:text-ink">
                Remove this SOP
              </summary>
              <form action={deleteSop} className="mt-2">
                <input type="hidden" name="id" value={entry.id} />
                <button
                  type="submit"
                  className="rounded-full border border-orange/40 px-3 py-1 text-caption text-ink transition hover:bg-blush/20"
                >
                  Delete &ldquo;{entry.title}&rdquo; permanently
                </button>
              </form>
            </details>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
