import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { recordStationVisit } from "@/lib/map/actions";
import { getArchivio, type ArchivioEntry } from "@/lib/sop/queries";
import { isComplete } from "@/lib/sop/template";
import { formatCalendarDate } from "@/lib/time-zone";
import { Card, NumberedRow, PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Archivio · aOS" };

type Folder = "sops" | "builds" | "templates";

const FOLDERS: { key: Folder; title: string; blurb: string; pick: (e: ArchivioEntry) => boolean }[] = [
  {
    key: "sops",
    title: "SOPs",
    blurb: "How things run, in your own words.",
    pick: (e) => e.source === "member_sop" || e.source === "ai_sop",
  },
  {
    key: "builds",
    title: "Past hot seats",
    blurb: "What got built live, and your write-up of each.",
    pick: (e) => e.source === "hot_seat",
  },
  {
    key: "templates",
    title: "Templates",
    blurb: "Pictures of what you made in the Tools.",
    pick: (e) => e.source === "template",
  },
];

/**
 * Archivio (§8): the member's own record — L'Editoriale "13".
 *
 * A search bar and three folders. Still exactly what it was conceptually, a
 * personal archive rather than a shared library; the folders are a way of
 * presenting the same personal data, not a different kind of screen. The
 * reference's Swipe Copy, Workbooks and Brand Assets folders are not here:
 * the brief drops them explicitly.
 *
 * Search filters the member's own entries by title, server-side, from the
 * query string — a search is a URL, and the list is small enough that a
 * database round trip for it would be ceremony.
 *
 * A real station on the map, and the one that holds nothing from the library.
 * This route shadows `/stations/[slug]` for that one slug, so the marker still
 * leads here and the visit is still recorded.
 */
export default async function ArchivioPage({ searchParams }: PageProps<"/stations/archivio">) {
  const member = (await getCurrentMember())!;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const folder = FOLDERS.find((f) => f.key === params.folder) ?? null;

  await recordStationVisit("archivio");
  const all = await getArchivio(member.id);

  const matches = (e: ArchivioEntry) =>
    !q || e.title.toLowerCase().includes(q.toLowerCase());

  const showing = folder ? all.filter(folder.pick).filter(matches) : q ? all.filter(matches) : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <PageHeader
        title="Archivio"
        tagline="Everything you built. Always here."
        actions={
          <div className="flex gap-2">
            <ButtonLink href="/stations/archivio/new" variant="secondary" size="sm">
              Write an SOP
            </ButtonLink>
            <ButtonLink href="/stations/archivio/templates/new" variant="secondary" size="sm">
              Save a template
            </ButtonLink>
          </div>
        }
      />

      <form action="/stations/archivio" method="get" role="search" className="mb-6">
        {folder ? <input type="hidden" name="folder" value={folder.key} /> : null}
        <label htmlFor="archivio-q" className="sr-only">
          Search your archive
        </label>
        <div className="flex items-center gap-3 rounded-full border border-ink/12 bg-cream-deep px-4 py-2.5 focus-within:border-orange focus-within:bg-card">
          <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-ink/45" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            id="archivio-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={folder ? `Search ${folder.title.toLowerCase()}…` : "Search your archive…"}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink/40"
          />
        </div>
      </form>

      {folder || q ? (
        <>
          <p className="mb-3 flex items-center gap-2 text-small text-ink/60">
            <Link href="/stations/archivio" className="underline underline-offset-4 hover:text-ink">
              All folders
            </Link>
            {folder ? (
              <>
                <span aria-hidden>›</span>
                <span className="text-ink">{folder.title}</span>
              </>
            ) : null}
            {q ? <span className="ml-auto">{showing.length} matching &ldquo;{q}&rdquo;</span> : null}
          </p>

          {showing.length === 0 ? (
            <Card>
              <p className="text-small text-ink/70">
                {q
                  ? "Nothing with that in the name."
                  : folder?.key === "builds"
                    ? "Your first hot seat build lands here automatically."
                    : folder?.key === "templates"
                      ? "Nothing saved yet. Save a screenshot of something you made in the Tools."
                      : "Nothing yet. Anything you run that only exists in your head is worth writing down before it has to be explained in a hurry."}
              </p>
            </Card>
          ) : (
            <Card padded={false}>
              <ol className="divide-y divide-ink/6 p-2">
                {showing.map((entry, i) => (
                  <NumberedRow
                    key={entry.id}
                    index={i + 1}
                    title={entry.title}
                    meta={metaFor(entry)}
                    href={`/stations/archivio/${entry.id}`}
                  />
                ))}
              </ol>
            </Card>
          )}
        </>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-ink/6 p-2">
            {FOLDERS.map((f) => {
              const count = all.filter(f.pick).length;
              return (
                <NumberedRow
                  key={f.key}
                  leading={<FolderIcon />}
                  title={f.title}
                  meta={`${count} ${count === 1 ? "item" : "items"} · ${f.blurb}`}
                  href={`/stations/archivio?folder=${f.key}`}
                />
              );
            })}
          </ul>
        </Card>
      )}

      <div className="mt-10">
        <Link
          href="/stations"
          className="text-small text-ink/70 underline decoration-orange decoration-2 underline-offset-4 transition hover:text-ink"
        >
          ← Return to The Map
        </Link>
      </div>
    </main>
  );
}

function metaFor(entry: ArchivioEntry): string {
  const when = formatCalendarDate(entry.created_at.slice(0, 10));
  if (entry.source === "template") return `Template · ${when}`;
  if (entry.source === "hot_seat") {
    return entry.sop
      ? `Built together · your SOP ${isComplete(entry.sop) ? "written" : "in progress"}`
      : entry.coach_note
        ? "Built together · Nina's left you a note. Write it up"
        : "Built together · not written up yet";
  }
  return entry.sop && !isComplete(entry.sop) ? `SOP · still to finish` : `SOP · ${when}`;
}

function FolderIcon() {
  return (
    <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-cream">
      <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
      </svg>
    </span>
  );
}
