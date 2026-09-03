"use client";

import { useActionState, useState } from "react";

import { saveSop, type SopState } from "@/lib/sop/actions";
import type { Sop } from "@/lib/sop/template";
import { Field, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Writing an SOP.
 *
 * The questions are the whole thing — this replaces an AI generator that would
 * have taken these same answers and rephrased them. So they're asked in the
 * order somebody actually thinks about a process: what sets it off, what it
 * should end with, then the steps between.
 *
 * Steps and tools grow by adding rows rather than by drag-and-drop. Order is
 * document order, which is the order they were typed, and a list you can't
 * reorder is far better than one you can't use on a phone.
 */
export function SopForm({
  id,
  title,
  sop,
}: {
  id?: string;
  title?: string;
  sop: Sop;
}) {
  const [state, formAction] = useActionState<SopState, FormData>(saveSop, null);
  const [steps, setSteps] = useState<string[]>(
    sop.steps.length > 0 ? sop.steps.map((s) => s.text) : ["", "", ""],
  );
  const [tools, setTools] = useState<string[]>(
    sop.tools.length > 0 ? sop.tools : [""],
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {id ? <input type="hidden" name="id" value={id} /> : null}

      <Card>
        <Eyebrow>What this is</Eyebrow>
        <div className="mt-3 flex flex-col gap-4">
          <Field
            label="Name it"
            name="title"
            defaultValue={title ?? ""}
            placeholder="Onboarding a new client"
            hint="What you'd call it when telling somebody to go and read it."
          />
          <TextArea
            label="What starts it off"
            name="trigger"
            rows={2}
            required={false}
            defaultValue={sop.trigger}
            placeholder="A new client signs the contract"
            hint="The thing that happens that means somebody needs to do this."
          />
          <TextArea
            label="What done looks like"
            name="outcome"
            rows={2}
            required={false}
            defaultValue={sop.outcome}
            placeholder="They're in the system, booked in, and have had the welcome pack"
            hint="So whoever picks this up can tell when they've finished."
          />
          <Field
            label="Whose job it is"
            name="owner"
            required={false}
            defaultValue={sop.owner}
            placeholder="Client manager"
            hint="A role rather than a name — names change, roles survive."
          />
        </div>
      </Card>

      <Card>
        <Eyebrow>The steps, in order</Eyebrow>
        <ol className="mt-3 flex flex-col gap-2">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="font-mono mt-2.5 w-5 shrink-0 text-caption text-navy/40">
                {index + 1}
              </span>
              <input
                name="steps"
                defaultValue={step}
                placeholder={index === 0 ? "First thing they do" : ""}
                className="min-w-0 flex-1 rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy placeholder:text-navy/40"
              />
            </li>
          ))}
        </ol>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2"
          onClick={() => setSteps([...steps, ""])}
        >
          Add another step
        </Button>
        <p className="mt-2 text-caption text-navy/50">
          Blank rows are ignored, so leave the extras alone.
        </p>
      </Card>

      <Card>
        <Eyebrow>Anything else that helps</Eyebrow>
        <div className="mt-3 flex flex-col gap-4">
          <div>
            <span className="text-small font-medium text-navy">
              Tools it&rsquo;s done in
            </span>
            <div className="mt-1.5 flex flex-col gap-2">
              {tools.map((tool, index) => (
                <input
                  key={index}
                  name="tools"
                  defaultValue={tool}
                  placeholder="HeyClients"
                  className="rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy placeholder:text-navy/40"
                />
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setTools([...tools, ""])}
            >
              Add another tool
            </Button>
          </div>

          <Field
            label="Walkthrough video"
            name="video_url"
            type="url"
            required={false}
            defaultValue={sop.video_url ?? ""}
            placeholder="https://"
            hint="Optional. A screen recording often explains in two minutes what a page of steps doesn't."
          />
        </div>
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />
      <SubmitButton full={false}>{id ? "Save changes" : "Save it"}</SubmitButton>
    </form>
  );
}
