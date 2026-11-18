"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { IconCircle } from "./icons";
import { formatValue } from "@/lib/reporting/format";
import { saveTopPosts, type TopPostState } from "@/lib/reporting/top-post-actions";
import { type TopPost } from "@/lib/reporting/top-posts";
import {
  postFigureLabel,
  postFiguresFor,
  postTypeLabel,
  postTypesFor,
  type PostFigureKey,
} from "@/lib/reporting/platform-post-types";
import type { PlatformKind } from "@/lib/reporting/platforms";

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

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function dayOf(date: string | null): string | null {
  if (!date) return null;
  return DAY.format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/**
 * The link's own words, since there is no caption to use.
 *
 * In the platform's words for them (18 November): a YouTube entry reads
 * "Short, 4 Sep" rather than "Reel, 4 Sep", and a LinkedIn one "Image"
 * rather than "Photo". The value stored is the same either way — see
 * `platform-post-types.ts`.
 */
function postLabel(
  post: Pick<TopPost, "postType" | "postedOn">,
  rank: number,
  platformKind: PlatformKind | null,
): string {
  const kind = post.postType ? postTypeLabel(post.postType, platformKind) : "Post";
  const day = dayOf(post.postedOn);
  return day ? `${kind}, ${day}` : `${kind} ${rank}`;
}

export function TopPostsReport({
  posts,
  platformName,
  platformKind,
  showPlatform,
}: {
  posts: TopPost[];
  platformName: string;
  /** Whose words the kinds of post wear. */
  platformKind: PlatformKind | null;
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
              <span className="font-num text-small text-ink/45">{post.rank}</span>
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
                {postLabel(post, post.rank, platformKind)}
              </a>
            </div>
            <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
              {/* In this platform's order and its words, and never a
                  figure the post does not hold — a TikTok entry used to
                  read "Reach 10,933 … Saves 197" on a platform that
                  reports neither. */}
              {postFiguresFor(platformKind, [post])
                .filter((key) => post[key] !== null)
                .map((key) => (
                  <div key={key} className="flex items-baseline gap-1.5">
                    <dt className="text-caption text-ink/55">
                      {postFigureLabel(key, platformKind)}
                    </dt>
                    <dd className="font-num text-small text-ink">
                      {formatValue(post[key] as number, "count", "GBP")}
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
 * What the form calls each figure, which is not what the row does.
 *
 * `likes_plus_comments` is the column and `likes` is the field; the
 * action has parsed `post:1:likes` since 11 November and a published
 * month's saved form must keep posting the same name.
 */
const FIELD: Record<PostFigureKey, string> = {
  reach: "reach",
  views: "views",
  likesPlusComments: "likes",
  saves: "saves",
  shares: "shares",
};

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
  platformKind,
  posts,
  filled,
}: {
  workspaceId: string;
  month: string;
  platformId: string;
  platformName: string;
  /** Which kinds of post this platform has, and what it calls them. */
  platformKind: PlatformKind | null;
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
                <span className="font-num text-small text-ink/45">{rank}</span>
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
                    {/* This platform's kinds of post, plus whatever
                        these three already are — a select whose value
                        has no option silently shows the first one, so
                        without `held` a kind corrected would retype
                        three posts the moment somebody pressed Save. */}
                    {postTypesFor(platformKind, (type) =>
                      shown.some((p) => p.postType === type),
                    ).map((type) => (
                      <option key={type} value={type}>
                        {postTypeLabel(type, platformKind)}
                      </option>
                    ))}
                  </select>
                </label>
                {/* The boxes follow the platform too: the five columns
                    are fixed in the table, and which of them this kind
                    reports — and what it calls them — is not. A column
                    any of the three posts already holds stays, whatever
                    the kind says. */}
                {postFiguresFor(platformKind, shown).map((key) => {
                  const value = post?.[key] ?? null;
                  return (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-caption text-ink/55">
                        {postFigureLabel(key, platformKind)}
                      </span>
                      <input
                        name={`post:${rank}:${FIELD[key]}`}
                        inputMode="numeric"
                        defaultValue={value ?? ""}
                        key={`${key}-${rank}-${value ?? ""}`}
                        className={`${field} w-28 font-num`}
                      />
                    </label>
                  );
                })}
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
