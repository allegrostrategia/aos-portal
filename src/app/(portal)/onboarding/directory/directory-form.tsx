"use client";

import { useActionState } from "react";

import {
  saveDirectoryListing,
  type OnboardingFormState,
} from "@/lib/onboarding/actions";
import { Field, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import type { MemberProfile } from "@/lib/supabase/types";

export function DirectoryForm({
  profile,
  fallbackName,
}: {
  profile: MemberProfile | null;
  fallbackName: string;
}) {
  const [state, formAction] = useActionState<OnboardingFormState, FormData>(
    saveDirectoryListing,
    null,
  );

  const links = profile?.links ?? [];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Name"
        name="display_name"
        defaultValue={profile?.display_name ?? fallbackName}
        autoComplete="name"
      />
      <Field
        label="Title"
        name="title"
        required={false}
        defaultValue={profile?.title ?? ""}
        hint="How you'd describe what you do — “Fractional COO”, “Brand photographer”."
      />
      <TextArea
        label="Short bio"
        name="bio"
        defaultValue={profile?.bio ?? ""}
        rows={5}
        hint="A few lines. Who you help, and what changes for them."
      />

      <fieldset className="flex flex-col gap-3 rounded-md border border-navy/15 bg-white/50 p-4">
        <legend className="px-1 text-small font-medium text-navy">
          Ways to work with you
        </legend>
        <p className="text-caption text-navy/60">
          Up to three. Leave any blank you don&rsquo;t need.
        </p>

        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
            <Field
              label={`Label ${i + 1}`}
              name={`link_label_${i}`}
              required={false}
              defaultValue={links[i]?.label ?? ""}
            />
            <Field
              label={`Link ${i + 1}`}
              name={`link_url_${i}`}
              type="url"
              required={false}
              placeholder="https://"
              defaultValue={links[i]?.url ?? ""}
            />
          </div>
        ))}
      </fieldset>

      <FormMessage error={state?.error} notice={state?.notice} />

      <SubmitButton>Save my listing</SubmitButton>
    </form>
  );
}
