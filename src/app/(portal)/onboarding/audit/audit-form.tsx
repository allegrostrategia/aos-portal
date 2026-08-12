"use client";

import { useActionState } from "react";

import {
  submitAudit,
  type OnboardingFormState,
} from "@/lib/onboarding/actions";
import type { AuditQuestion } from "@/lib/onboarding/audit-questions";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";

/**
 * Radio groups rather than a select per question: every option visible without a
 * tap, which is what keeps a nine-question form from feeling like paperwork —
 * and drop-off is the risk §1 chose multiple choice to avoid.
 */
export function AuditForm({
  questions,
  stationNames,
}: {
  questions: AuditQuestion[];
  stationNames: Record<string, string>;
}) {
  const [state, formAction] = useActionState<OnboardingFormState, FormData>(
    submitAudit,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {questions.map((question, index) => (
        <Card as="fieldset" key={question.id}>
          <legend className="contents">
            <Eyebrow>
              {index + 1} · {stationNames[question.stationSlug] ?? "aOS"}
            </Eyebrow>
            <p className="mt-2 mb-4 text-body font-medium text-navy">
              {question.prompt}
            </p>
          </legend>

          <div className="flex flex-col gap-2">
            {question.options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-navy/10 bg-white/60 px-3 py-2.5 text-small text-navy transition hover:border-navy/25 has-checked:border-orange has-checked:bg-blush/15"
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option.value}
                  className="mt-0.5 size-4 accent-navy"
                  required
                />
                {option.label}
              </label>
            ))}
          </div>
        </Card>
      ))}

      <FormMessage error={state?.error} notice={state?.notice} />

      <div className="sticky bottom-20 lg:bottom-4">
        <SubmitButton>Submit your audit</SubmitButton>
      </div>
    </form>
  );
}
