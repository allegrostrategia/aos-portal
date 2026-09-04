"use client";

import { useActionState, useState } from "react";

import { rephraseWriteUp, type SopState } from "@/lib/sop/actions";
import { FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/**
 * The member's own copy of a build write-up (§8).
 *
 * Read as prose until they choose to change it. Presenting somebody's record of
 * what they built as a text box waiting to be filled in is a different, worse
 * message than presenting it as something written for them that they may adjust.
 */
export function WriteUpEditor({ id, body }: { id: string; body: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<SopState, FormData>(
    rephraseWriteUp,
    null,
  );

  if (!editing) {
    return (
      <>
        <div className="text-body whitespace-pre-wrap text-navy/85">{body}</div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-caption text-navy/60 underline underline-offset-4 transition hover:text-navy"
        >
          Put it in your own words
        </button>
      </>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`body-${id}`} className="text-small font-medium text-navy">
        Your copy
      </label>
      <textarea
        id={`body-${id}`}
        name="body"
        rows={8}
        defaultValue={body}
        className="w-full rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy"
      />
      <p className="text-caption text-navy/60">
        This is yours to reword. It doesn&rsquo;t change anything Nina sees about
        the build itself.
      </p>
      <FormMessage error={state?.error} notice={state?.notice} />
      <div className="flex gap-3">
        <Button type="submit" size="sm">
          Save my version
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEditing(false)}
        >
          Leave it as it is
        </Button>
      </div>
    </form>
  );
}
