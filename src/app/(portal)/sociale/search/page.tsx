import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { searchMessages } from "@/lib/chat/queries";
import { formatSessionTimeShort } from "@/lib/time-zone";
import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Search Sociale · aOS" };

/**
 * Search across chat (round 2, E3). A real text-search index over the message
 * body, not LIKE; RLS keeps the results to channels the member can see. The
 * query lives in the URL, so a search is a link.
 */
export default async function SearchPage({ searchParams }: PageProps<"/sociale/search">) {
  const member = (await getCurrentMember())!;
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const hits = q ? await searchMessages(q) : [];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 py-6 sm:py-10">
      <p className="mb-4">
        <Link href="/sociale" className="text-small text-ink/60 transition hover:text-ink">
          ← Sociale
        </Link>
      </p>
      <PageHeader size="title" title="Search" tagline="Every room you're in" />

      <form action="/sociale/search" method="get" role="search" className="mb-6">
        <label htmlFor="sociale-q" className="sr-only">Search messages</label>
        <div className="flex items-center gap-3 rounded-full border border-ink/12 bg-cream-deep px-4 py-2.5 focus-within:border-orange focus-within:bg-card">
          <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-ink/45" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            id="sociale-q"
            name="q"
            type="search"
            defaultValue={q}
            autoFocus={!q}
            placeholder="A word or two from the message"
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink/40"
          />
        </div>
      </form>

      {q && hits.length === 0 ? (
        <Card>
          <p className="text-small text-ink/70">Nothing with that in it, in any room you&rsquo;re in.</p>
        </Card>
      ) : hits.length > 0 ? (
        <Card padded={false}>
          <ul className="divide-y divide-ink/6">
            {hits.map((hit) => (
              <li key={hit.id}>
                <Link href={hit.channelHref} className="block px-5 py-3.5 transition hover:bg-cream-deep/70">
                  <p className="flex items-baseline justify-between gap-3 text-caption text-ink/55">
                    <span>
                      <span className="font-medium text-ink/75">{hit.member_id === member.id ? "You" : hit.authorName}</span>
                      {" in "}
                      {hit.channelName}
                    </span>
                    <span className="shrink-0 font-mono">{formatSessionTimeShort(hit.created_at)}</span>
                  </p>
                  <p className="mt-1 text-small break-words whitespace-pre-wrap text-ink">{hit.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </main>
  );
}
