"use client";

import { useState } from "react";

import { EntryForm, type EntryFormProps } from "./entry-form";
import { TopPostsEntry } from "./top-posts";
import type { TopPost } from "@/lib/reporting/top-posts";

/**
 * Social Media's entry screen: the figures and the top posts together.
 *
 * **It exists for one reason** — the Meta content export fills both, and
 * one upload should not have to be done twice. The upload card lives
 * inside `EntryForm`, the posts live in a form of their own (an HTML
 * form cannot contain another), so the three posts the file offers have
 * to be held by something that can see both. This is that something,
 * and it holds nothing else.
 *
 * The two are still saved separately and checked separately, which is
 * the point of the preview on each: a file that got the figures right
 * and the posts wrong should not be all or nothing.
 */
export function SocialEntry({
  entry,
  posts,
}: {
  entry: EntryFormProps;
  posts: {
    workspaceId: string;
    month: string;
    platformId: string;
    platformName: string;
    posts: TopPost[];
  };
}) {
  const [filled, setFilled] = useState<TopPost[] | null>(null);

  return (
    <>
      <EntryForm {...entry} onPosts={setFilled} />
      <TopPostsEntry {...posts} filled={filled} />
    </>
  );
}
