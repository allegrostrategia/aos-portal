"use client";

import { useActionState } from "react";
import { HeadshotField } from "./headshot-field";

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
      <HeadshotField path={profile?.headshot_path ?? null} />
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
        hint="How you'd describe what you do: “Fractional COO”, “Brand photographer”."
      />
      {/* Two boxes, as the round-2 brief asks (C5). Not "how to work with you". */}
      <TextArea
        label="What my business is all about"
        name="business_about"
        required={false}
        defaultValue={profile?.business_about ?? ""}
        rows={4}
        hint="Who you help, and what changes for them."
      />
      <TextArea
        label="A bit more about me"
        name="bio"
        required={false}
        defaultValue={profile?.bio ?? ""}
        rows={4}
        hint="The person behind it. Whatever you'd want another member to know."
      />

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-ink/12 bg-card p-4">
        <legend className="px-1 text-small font-medium text-ink">
          Your links
        </legend>
        <p className="text-caption text-ink/60">
          Your website, or wherever you&rsquo;d send somebody. Up to three; leave any blank.
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

      <SubmitButton>Save my profile</SubmitButton>
    </form>
  );
}
