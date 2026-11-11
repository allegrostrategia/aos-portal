"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "./icons";
import { formatValue } from "@/lib/reporting/format";
import { saveTopPosts, type TopPostState } from "@/lib/reporting/top-post-actions";
import { POST_TYPES, type PostType, type TopPost } from "@/lib/reporting/top-posts";

/**
 * The month's top three posts, per platform (Nina, 11 November).
 *
 * "It shows clients what style of post to make next month" — which is
 * why the kind of post is beside the link and why the figures are the
 * ones that say how far it travelled, rather than a single score.
 *
 * **No caption anywhere in this file.** The link opens the post, which
 * has the caption in it (Nina, 11 November). So the link's own text is
 * the kind of post and the day it went out, which is what somebody
 * scanning the list is matching against their own memory of the month.
 */

const TYPE_LABEL: Record<PostType, string> = {
  reel: "Reel",
  carousel: "Carousel",
  photo: "Photo",
  video: "Video",
  story: "Story",
  other: "Post",
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function dayOf(date: string | null): string | null {
  if (!date) return null;
  return DAY.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/** The link's own words, since there is no caption to use. */
function postLabel(post: Pick<TopPost, "postType" | "postedOn">, rank: number): string {
  const kind = post.postType ? TYPE_LABEL[post.postType] : "Post";
  const day = dayOf(post.postedOn);
  return day ? `${kind}, ${day}` : `${kind} ${rank}`;
}

const FIGURES: { key: keyof TopPost; label: string }[] = [
  { key: "reach", label: "Reach" },
  { key: "views", label: "Views" },
  { key: "likesPlusComments", label: "Likes + comments" },
  { key: "saves", label: "Saves" },
  { key: "shares", label: "Shares" },
];

export function TopPostsReport({
  posts,
  platformName,
  showPlatform,
}: {
  posts: TopPost[];
  platformName: string;
  /** Only when there is more than one platform to tell apart. */
  showPlatform: boolean;
}) {
  if (posts.length === 0) return null;

  return (
    <Card className="mt-6">
      <SectionTitle
        icon={<IconCircle name="bookmark" tone="orange" />}
        aside={showPlatform ? platformName : undefined}
      >
        Top posts this month
      </SectionTitle>
      <p className="mt-1 text-small text-ink/70">
        Ranked by how many people they reached. Open one to see what it was.
      </p>

      <ol className="mt-4 flex flex-col gap-3">
        {posts.map((post) => (
          <li key={post.rank} className="border-t border-ink/8 pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-small text-ink/45">{post.rank}</span>
              {/* `rel` on every outward link: `noopener` because the new
                  tab would otherwise get a handle on this one, and
                  `noreferrer` because where a client reads their report
                  is nobody else's business. */}
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-body font-medium text-ink underline decoration-ink/25 underline-offset-4 transition hover:decoration-ink"
              >
                {postLabel(post, post.rank)}
              </a>
            </div>
            <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
              {FIGURES.filter((figure) => post[figure.key] !== null).map((figure) => (
                <div key={figure.key} className="flex items-baseline gap-1.5">
                  <dt className="text-caption text-ink/55">{figure.label}</dt>
                  <dd className="font-mono text-small text-ink">
                    {formatValue(post[figure.key] as number, "count", "GBP")}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const field =
  "w-full rounded-xl border border-ink/12 bg-cream-deep px-3 py-2 text-small text-ink outline-none transition focus:border-orange focus:bg-card focus:ring-2 focus:ring-orange/30";

/**
 * Typing the three in, or checking the three the file filled.
 *
 * Instagram's arrive from the Meta content export, which carries every
 * post's permalink and figures; LinkedIn and TikTok are typed, because
 * neither has an export we take. Same three rows either way, so there is
 * one screen to learn rather than two.
 */
export function TopPostsEntry({
  workspaceId,
  month,
  platformId,
  platformName,
  posts,
  filled,
}: {
  workspaceId: string;
  month: string;
  platformId: string;
  platformName: string;
  posts: TopPost[];
  /** Posts the upload card has just read, waiting to be kept or ignored. */
  filled?: TopPost[] | null;
}) {
  const [state, action] = useActionState<TopPostState, FormData>(saveTopPosts, null);
  const [shown, setShown] = useState<TopPost[]>(posts);
  const [fromFile, setFromFile] = useState(false);

  const at = (rank: number) => shown.find((post) => post.rank === rank) ?? null;

  return (
    <Card className="mt-6">
      <SectionTitle
        icon={<IconCircle name="bookmark" tone="orange" />}
        aside={platformName}
      >
        Top posts this month
      </SectionTitle>
      <p className="mt-1 text-small text-ink/70">
        The three that reached most. The client sees the link, the kind of post and these
        figures — never a caption.
      </p>

      {filled && filled.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-cream-deep px-3 py-2.5">
          <p className="grow text-small text-ink/75">
            The file has {filled.length} post{filled.length === 1 ? "" : "s"} for this month.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setShown(filled);
              setFromFile(true);
            }}
          >
            Fill these in
          </Button>
        </div>
      ) : null}

      <form action={action} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="platform_id" value={platformId} />

        {[1, 2, 3].map((rank) => {
          const post = at(rank);
          return (
            <div
              key={rank}
              className="flex flex-col gap-2 border-t border-ink/8 pt-3 first:border-0 first:pt-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-small text-ink/45">{rank}</span>
                <label htmlFor={`post-${rank}-url`} className="sr-only">
                  Link to post {rank}
                </label>
                <input
                  id={`post-${rank}-url`}
                  name={`post:${rank}:url`}
                  defaultValue={post?.url ?? ""}
                  key={`url-${rank}-${post?.url ?? ""}`}
                  placeholder="https://…"
                  className={field}
                />
                {fromFile ? (
                  <input type="hidden" name={`post:${rank}:source`} value="csv" />
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-ink/55">Date</span>
                  <input
                    name={`post:${rank}:posted_on`}
                    type="date"
                    defaultValue={post?.postedOn ?? ""}
                    key={`date-${rank}-${post?.postedOn ?? ""}`}
                    className={`${field} w-40`}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-ink/55">Kind</span>
                  <select
                    name={`post:${rank}:post_type`}
                    defaultValue={post?.postType ?? ""}
                    key={`type-${rank}-${post?.postType ?? ""}`}
                    className={`${field} w-32`}
                  >
                    <option value="">—</option>
                    {POST_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ["reach", "Reach", post?.reach],
                    ["views", "Views", post?.views],
                    ["likes", "Likes + comments", post?.likesPlusComments],
                    ["saves", "Saves", post?.saves],
                    ["shares", "Shares", post?.shares],
                  ] as const
                ).map(([name, label, value]) => (
                  <label key={name} className="flex flex-col gap-1">
                    <span className="text-caption text-ink/55">{label}</span>
                    <input
                      name={`post:${rank}:${name}`}
                      inputMode="numeric"
                      defaultValue={value ?? ""}
                      key={`${name}-${rank}-${value ?? ""}`}
                      className={`${field} w-28 font-mono`}
                    />
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <Footer state={state} />
      </form>
    </Card>
  );
}

function Footer({ state }: { state: TopPostState }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p
        aria-live="polite"
        className={`text-small ${state?.error ? "text-deep-red" : "text-ink/60"}`}
      >
        {pending
          ? "Saving…"
          : (state?.error ??
            state?.notice ??
            "Clearing a row takes that post off the report.")}
      </p>
      <Button type="submit" disabled={pending}>
        Save top posts
      </Button>
    </div>
  );
}
