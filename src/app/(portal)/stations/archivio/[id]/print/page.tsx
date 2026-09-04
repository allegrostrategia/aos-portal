import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/member";
import { getArchivioEntry } from "@/lib/sop/queries";

export const metadata: Metadata = { title: "SOP — aOS" };

/**
 * The exportable version (§11).
 *
 * SOPs are the only content in the product a member can take out, and this is
 * how they take it: a clean page and the browser's own print-to-PDF. That's a
 * deliberate choice over a PDF library — it adds no dependency, no server
 * rendering and no font embedding, it works on a phone through the share sheet,
 * and the output is a real PDF the member owns.
 *
 * The trade is control over pagination, which for a page of numbered steps is
 * worth giving up. If a branded, precisely laid out document is ever wanted,
 * that's when a real renderer earns its dependency.
 *
 * It renders inside the portal layout, which is where the member session lives,
 * so the navigation is hidden at print time in the layout rather than avoided
 * here. Styles stay inline: this page is a document, not a screen.
 */
export default async function SopPrintPage({
  params,
}: PageProps<"/stations/archivio/[id]/print">) {
  const member = (await getCurrentMember())!;
  const { id } = await params;

  const entry = await getArchivioEntry(member.id, id);
  if (!entry?.sop) notFound();

  const sop = entry.sop;

  return (
    <main className="mx-auto w-full max-w-[46rem] bg-white px-8 py-10 text-navy print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { margin: 18mm; }
          .no-print { display: none !important; }
          /* A step split across two pages is the one thing that makes a
             printed process hard to follow. */
          li, section { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-8 rounded-lg border border-navy/15 bg-lemon/25 px-4 py-3">
        <p className="text-small text-navy/80">
          Print this page and choose <strong className="font-medium">Save as PDF</strong>{" "}
          as the destination — on a phone, use Share then Print.
        </p>
      </div>

      <header className="mb-8 border-b border-navy/20 pb-5">
        <p className="font-mono text-eyebrow text-navy/50 uppercase">
          Standard operating procedure
        </p>
        <h1 className="font-display mt-2 text-title text-navy italic">
          {entry.title}
        </h1>
        {sop.owner ? (
          <p className="mt-2 text-small text-navy/70">Owned by {sop.owner}</p>
        ) : null}
      </header>

      {sop.trigger ? (
        <section className="mb-6">
          <h2 className="font-mono text-eyebrow text-navy/50 uppercase">
            What starts it
          </h2>
          <p className="mt-1 text-body whitespace-pre-wrap">{sop.trigger}</p>
        </section>
      ) : null}

      {sop.outcome ? (
        <section className="mb-6">
          <h2 className="font-mono text-eyebrow text-navy/50 uppercase">
            What done looks like
          </h2>
          <p className="mt-1 text-body whitespace-pre-wrap">{sop.outcome}</p>
        </section>
      ) : null}

      {sop.tools.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-mono text-eyebrow text-navy/50 uppercase">Tools</h2>
          <p className="mt-1 text-body">{sop.tools.join(" · ")}</p>
        </section>
      ) : null}

      {sop.steps.length > 0 ? (
        <section className="mb-6">
          <h2 className="font-mono text-eyebrow text-navy/50 uppercase">Steps</h2>
          <ol className="mt-2 flex flex-col gap-3">
            {sop.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="font-mono w-6 shrink-0 text-small text-navy/40">
                  {index + 1}.
                </span>
                <span className="text-body whitespace-pre-wrap">{step.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sop.video_url ? (
        <section className="mb-6">
          <h2 className="font-mono text-eyebrow text-navy/50 uppercase">
            Walkthrough
          </h2>
          {/* Printed on paper a link is unclickable, so the address is shown
              rather than hidden behind link text. */}
          <p className="mt-1 text-small break-all">{sop.video_url}</p>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-navy/15 pt-4">
        <p className="text-caption text-navy/50">
          {entry.title} · aOS · Allegro Strategia
        </p>
      </footer>
    </main>
  );
}
