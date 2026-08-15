"use client";

import { useActionState } from "react";

import { submitWeeklyLog, type LogState } from "@/lib/log/actions";
import type { RoadmapItem } from "@/lib/log/queries";
import { FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";

export function WeeklyLogForm({
  roadmapItems,
  defaultOtherActivity,
}: {
  roadmapItems: RoadmapItem[];
  defaultOtherActivity: string;
}) {
  const [state, formAction] = useActionState<LogState, FormData>(
    submitWeeklyLog,
    null,
  );

  // Grouped by phase so the list reads as the roadmap does, not as a flat pile.
  const byPhase = roadmapItems.reduce<Record<string, RoadmapItem[]>>(
    (groups, item) => {
      const key = item.phaseTitle ?? "";
      (groups[key] ??= []).push(item);
      return groups;
    },
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card>
        <Eyebrow>What you moved on</Eyebrow>

        {roadmapItems.length === 0 ? (
          <p className="mt-3 text-small text-navy/70">
            Your roadmap arrives at your 1:1 in week four — until then there
            isn&rsquo;t a checklist to tick. Use the box below for anything worth
            remembering about the week.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {Object.entries(byPhase).map(([phase, items]) => (
              <div key={phase}>
                {phase ? (
                  <p className="mb-2 text-small font-medium text-navy/80">
                    {phase}
                  </p>
                ) : null}
                <div className="flex flex-col gap-1">
                  {items.map((item) => (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-small text-navy transition hover:bg-white/60"
                    >
                      <input
                        type="checkbox"
                        name={`action:${item.key}`}
                        className="mt-0.5 size-4 accent-navy"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <TextArea
          label="Anything else this week"
          name="other_activity"
          rows={5}
          defaultValue={defaultOtherActivity}
          hint="What happened outside the plan — and anything you're stuck on. Nina reads these and answers on Monday morning, so a question here is the quickest way to get one."
        />
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />

      {state?.notice ? null : (
        <div>
          <SubmitButton full={false}>Sign this week&rsquo;s log</SubmitButton>
          <p className="mt-2 text-small text-navy/60">
            Once it&rsquo;s in, it stays as written — it&rsquo;s a dated entry,
            not a document.
          </p>
        </div>
      )}
    </form>
  );
}
