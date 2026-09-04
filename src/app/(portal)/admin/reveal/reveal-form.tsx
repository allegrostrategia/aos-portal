"use client";

import { useActionState, useState } from "react";

import { saveReveal, type RevealState } from "@/lib/reveal/actions";
import type { Reveal } from "@/lib/reveal/shape";
import { Field, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Writing the reveal document.
 *
 * The questions follow the document's own order, because the order is the
 * argument: what they said, what's working, what isn't, and only then what to
 * do about it. Asking for priorities first would produce a list of tasks; asking
 * for the diagnosis first produces a document that reads as somebody having
 * understood them.
 */
export function RevealForm({
  memberId,
  reveal,
}: {
  memberId: string;
  reveal: Reveal;
}) {
  const [state, formAction] = useActionState<RevealState, FormData>(
    saveReveal,
    null,
  );

  const [priorities, setPriorities] = useState(
    reveal.priorities.length > 0
      ? reveal.priorities
      : [
          { title: "", body: "" },
          { title: "", body: "" },
          { title: "", body: "" },
        ],
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="member_id" value={memberId} />

      <Card>
        <Eyebrow>The honest picture</Eyebrow>
        <div className="mt-3 flex flex-col gap-4">
          <TextArea
            label="In their words"
            name="in_their_words"
            rows={3}
            required={false}
            defaultValue={reveal.inTheirWords}
            hint="Something they actually said, quoted. This is the line that makes the document theirs."
          />
          <TextArea
            label="What's working"
            name="whats_working"
            rows={3}
            required={false}
            defaultValue={reveal.whatsWorking}
          />
          <TextArea
            label="What isn't"
            name="whats_not_working"
            rows={3}
            required={false}
            defaultValue={reveal.whatsNotWorking}
          />
        </div>
      </Card>

      <Card>
        <Eyebrow>Their first priorities</Eyebrow>
        <ol className="mt-3 flex flex-col gap-4">
          {priorities.map((priority, index) => (
            <li key={index} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono w-6 shrink-0 text-caption text-navy/40">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <input
                  name="priority_title"
                  defaultValue={priority.title}
                  placeholder="Rebuild your enquiry follow-up"
                  className="min-w-0 flex-1 rounded-md border border-navy/15 bg-white px-3 py-2 text-body text-navy placeholder:text-navy/40"
                />
              </div>
              <textarea
                name="priority_body"
                rows={2}
                defaultValue={priority.body}
                placeholder="Why this one, and why first"
                className="ml-8 rounded-md border border-navy/15 bg-white px-3 py-2 text-small text-navy placeholder:text-navy/40"
              />
            </li>
          ))}
        </ol>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => setPriorities([...priorities, { title: "", body: "" }])}
        >
          Add another
        </Button>
        <p className="mt-2 text-caption text-navy/50">
          Three at the 1:1, usually. An untitled one is left off rather than
          printed blank.
        </p>
      </Card>

      <Card>
        <Eyebrow>Their road</Eyebrow>
        <div className="mt-3 flex flex-col gap-4">
          <TextArea
            label="Where La Strada starts, and why"
            name="road_note"
            rows={3}
            required={false}
            defaultValue={reveal.roadNote}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Baseline"
              name="baseline"
              required={false}
              defaultValue={reveal.baseline}
              placeholder="~14 hrs/week on admin"
              hint="A phrase, not a figure the product has to defend."
            />
            <Field
              label="Starts"
              name="starts_on"
              required={false}
              defaultValue={reveal.startsOn}
              placeholder="Monday 7 September"
            />
          </div>
        </div>
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>Save</SubmitButton>
    </form>
  );
}
