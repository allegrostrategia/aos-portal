import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import { getReveal } from "@/lib/reveal/queries";
import { formatCalendarDate } from "@/lib/time-zone";

export const metadata: Metadata = { title: "Reveal — aOS" };

/**
 * The document itself (§1, target output in `Sample_aOS_Roadmap_Reveal.html`).
 *
 * Handed over at the 1:1 — so it prints, and Nina saves it as a PDF or sends it
 * on. Same choice as the SOP export: the browser's own print-to-PDF, no
 * dependency, no server rendering, no font embedding. The trade is pagination
 * control, and for a document of this length that is worth giving up.
 *
 * §1 asks for aOS's own type system rather than the source skill's, "so it reads
 * as the first page of aOS itself" — Cormorant for the display line, Inter for
 * the body, JetBrains Mono for the numbers, exactly as the portal does.
 *
 * It renders *inside* the portal layout — it needs the admin session, and the
 * layout is where that lives — so the chrome is hidden at print time there
 * rather than avoided here. Worth knowing before adding another print view:
 * `print:hidden` on the layout's nav is what makes this a document.
 */
export default async function RevealDocumentPage({
  params,
}: PageProps<"/admin/reveal/[memberId]/document">) {
  await requireAdmin();
  const { memberId } = await params;

  const supabase = await createClient();
  const { data: memberRow } = await supabase
    .from("members")
    .select("full_name")
    .eq("id", memberId)
    .maybeSingle();

  const reveal = await getReveal(memberId);
  const member = memberRow as { full_name: string } | null;
  if (!member || !reveal) notFound();

  const firstName = member.full_name.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-[46rem] bg-white px-8 py-10 text-navy print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { margin: 16mm; }
          .no-print { display: none !important; }
          /* A priority card split across a page break is the one thing that
             makes this awkward to read in the room. */
          section, li { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-8 rounded-lg border border-navy/15 bg-lemon/25 px-4 py-3">
        <p className="text-small text-navy/80">
          Print this page and choose <strong className="font-medium">Save as PDF</strong>.
          It&rsquo;s a snapshot of the 1:1 — it won&rsquo;t change as their roadmap does.
        </p>
      </div>

      <header className="mb-10">
        <p className="font-mono text-eyebrow text-navy/50 uppercase">
          Prepared by Nina
        </p>
        <h1 className="font-display mt-3 text-title text-navy italic">
          Welcome to aOS, {firstName}.
        </h1>

        <dl className="mt-6 grid gap-4 border-t border-navy/15 pt-4 sm:grid-cols-3">
          {[
            ["Prepared", reveal.preparedOn ? formatCalendarDate(reveal.preparedOn) : null],
            ["Baseline", reveal.baseline || null],
            ["Starts", reveal.startsOn || null],
          ].map(([label, value]) =>
            value ? (
              <div key={label}>
                <dt className="font-mono text-eyebrow text-navy/50 uppercase">
                  {label}
                </dt>
                <dd className="mt-1 text-small text-navy">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-heading text-navy italic">
          The honest picture
        </h2>
        <p className="text-small text-navy/60">
          What your audit and our call actually showed.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {reveal.inTheirWords ? (
            <blockquote className="border-l-2 border-orange pl-4">
              <p className="font-display text-heading text-navy italic">
                &ldquo;{reveal.inTheirWords}&rdquo;
              </p>
            </blockquote>
          ) : null}

          {[
            ["What's working", reveal.whatsWorking],
            ["What's not working", reveal.whatsNotWorking],
          ].map(([heading, body]) =>
            body ? (
              <div key={heading}>
                <h3 className="font-mono text-eyebrow text-navy/50 uppercase">
                  {heading}
                </h3>
                <p className="mt-1 text-body whitespace-pre-wrap text-navy/85">
                  {body}
                </p>
              </div>
            ) : null,
          )}
        </div>
      </section>

      {reveal.priorities.length > 0 ? (
        <section className="mb-10">
          <h2 className="font-display text-heading text-navy italic">
            Your first {reveal.priorities.length === 3 ? "three " : ""}priorities
          </h2>
          <p className="text-small text-navy/60">
            Where La Strada starts, and why.
          </p>

          <ol className="mt-4 flex flex-col gap-5">
            {reveal.priorities.map((priority, index) => (
              <li key={index} className="flex gap-4">
                <span className="font-mono text-heading text-orange">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-body font-medium text-navy">
                    {priority.title}
                  </h3>
                  {priority.body ? (
                    <p className="mt-1 text-small whitespace-pre-wrap text-navy/80">
                      {priority.body}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {reveal.roadNote ? (
        <section className="mb-10">
          <h2 className="font-display text-heading text-navy italic">Your road</h2>
          <p className="text-small text-navy/60">
            La Strada — where you&rsquo;re starting, and what&rsquo;s ahead.
          </p>
          <p className="mt-3 text-body whitespace-pre-wrap text-navy/85">
            {reveal.roadNote}
          </p>
        </section>
      ) : null}

      <footer className="border-t border-navy/15 pt-4">
        <p className="text-caption text-navy/50">
          aOS · Allegro Strategia · prepared for {member.full_name}
        </p>
      </footer>
    </main>
  );
}
