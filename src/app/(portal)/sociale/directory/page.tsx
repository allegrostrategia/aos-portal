import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentMember } from "@/lib/auth/member";
import { getOwnListing, searchDirectory } from "@/lib/directory/queries";
import { initials } from "@/lib/directory/initials";
import { openDirectMessage } from "@/lib/chat/actions";
import { Card, Eyebrow, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Directory — aOS" };

/**
 * The member directory (§10).
 *
 * A searchable utility rather than a destination, which is why it sits in Piazza
 * Sociale beside chat and not inside a themed station.
 *
 * Search is a plain GET form. No JavaScript, no debounce, no client state — the
 * query lives in the URL, so a search can be linked, bookmarked and gone back
 * to, and it works before hydration on a phone with a poor connection.
 *
 * This route shadows /sociale/[channel] for the literal path "directory". Static
 * segments win in Next's matcher, so that's stable — it only matters if a group
 * channel is ever given the slug "directory", which nothing does.
 */
export default async function DirectoryPage({
  searchParams,
}: PageProps<"/sociale/directory">) {
  const member = (await getCurrentMember())!;
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";

  const [entries, ownListing] = await Promise.all([
    searchDirectory(query),
    getOwnListing(member.id),
  ]);

  return (
    <main className="flex-1 py-8 sm:py-10">
      <p className="mb-4">
        <Link
          href="/sociale"
          className="text-small text-navy/70 underline underline-offset-4 transition hover:text-navy"
        >
          ← Piazza Sociale
        </Link>
      </p>

      <PageHeader
        eyebrow="Directory"
        title="Who else is here"
        intro="Search by name, what someone does, or anything in their bio. Then say hello."
      />

      {/* Filling this in is a required onboarding task, so most members are
          already here. The ones who aren't are accounts created straight into
          `active` — an admin, in practice — who never saw the onboarding
          sequence and have no nav route to the form. Without this, the only way
          in is knowing a URL, which is a quiet gap for one kind of account
          rather than a path that works for all of them. */}
      {ownListing !== "complete" ? (
        <Card className="mb-6 bg-lemon/25">
          <Eyebrow>You&rsquo;re not in the directory yet</Eyebrow>
          <p className="mt-1 text-small text-navy/80">
            {ownListing === "draft"
              ? "Your profile is started but not finished, so nobody can find you or message you from here."
              : "Other members can't find you or message you until you add a profile."}
          </p>
          <p className="mt-3">
            <Link
              href="/onboarding/directory"
              className="text-small text-navy underline decoration-orange decoration-2 underline-offset-4"
            >
              {ownListing === "draft" ? "Finish your profile" : "Add your profile"}
            </Link>
          </p>
        </Card>
      ) : null}

      <form method="get" className="mb-6 flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Try “operations”, “coach”, a name…"
          aria-label="Search the directory"
          className="min-w-0 flex-1 rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy placeholder:text-navy/40"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {query ? (
          <Link
            href="/sociale/directory"
            className="self-center text-caption text-navy/60 underline underline-offset-4 transition hover:text-navy"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {/* Persistent, and deliberately not conditional on anything. The card
          above only appears when somebody isn't in the directory at all — but a
          member who IS listed and has no photo saw nothing, which after
          headshots landed was every existing member. It also survives a search:
          "edit" on your own card vanishes the moment you search for something
          your own bio doesn't match. */}
      <p className="mb-6 text-small text-navy/70">
        <Link
          href="/onboarding/directory"
          className="text-navy underline decoration-orange decoration-2 underline-offset-4"
        >
          Your profile
        </Link>{" "}
        — add a photo, change your bio, or update your links.
      </p>

      {entries.length === 0 ? (
        <Card>
          <p className="text-small text-navy/70">
            {query
              ? `Nothing matching “${query}”. Search covers names, titles and bios — there are no filters to have set wrongly.`
              : "Nobody has a profile yet. Everyone fills theirs in during their first weeks, so this fills up as people join."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => {
            const isMe = entry.memberId === member.id;

            return (
              <Card as="li" key={entry.memberId} className="flex flex-col">
                <div className="flex items-start gap-3">
                  {entry.headshotUrl ? (
                    /* Signed storage URLs expire in an hour, so next/image's
                       optimiser would cache one and keep serving it long after
                       it stops working. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.headshotUrl}
                      alt=""
                      className="size-14 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="font-display flex size-14 shrink-0 items-center justify-center rounded-full bg-navy text-body text-white italic"
                    >
                      {initials(entry.displayName)}
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="font-display text-heading text-navy italic">
                      {entry.displayName}
                      {isMe ? (
                        <span className="font-body text-caption text-navy/50 not-italic">
                          {" "}
                          · you
                        </span>
                      ) : null}
                    </p>
                    {entry.title ? (
                      <p className="text-small text-navy/70">{entry.title}</p>
                    ) : null}
                  </div>
                </div>

                {entry.bio ? (
                  <p className="mt-3 text-small whitespace-pre-wrap text-navy/80">
                    {entry.bio}
                  </p>
                ) : null}

                {entry.links.length > 0 ? (
                  <div className="mt-3">
                    <Eyebrow>Ways to work with them</Eyebrow>
                    <ul className="mt-1 flex flex-col gap-1">
                      {entry.links.map((link) => (
                        <li key={link.url}>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-small text-navy underline decoration-orange decoration-2 underline-offset-4"
                          >
                            {link.label || link.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {!isMe ? (
                  <form action={openDirectMessage} className="mt-4">
                    <input type="hidden" name="member_id" value={entry.memberId} />
                    <Button type="submit" size="sm" variant="secondary">
                      Message {entry.displayName.split(" ")[0]}
                    </Button>
                  </form>
                ) : (
                  <p className="mt-4">
                    <Link
                      href="/onboarding/directory"
                      className="text-caption text-navy/60 underline underline-offset-4 transition hover:text-navy"
                    >
                      Edit your profile
                    </Link>
                  </p>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </main>
  );
}
