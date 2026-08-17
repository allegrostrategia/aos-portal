"use client";

import { useActionState } from "react";

import { saveContent, type LibraryState } from "@/lib/admin/library-actions";
import { Checkbox, Field, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";

const SELECT =
  "w-full rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy";

function Select({
  label,
  name,
  options,
  hint,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-small font-medium text-navy">
        {label}
      </label>
      <select id={name} name={name} defaultValue="" className={SELECT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <p className="text-caption text-navy/60">{hint}</p> : null}
    </div>
  );
}

export function ContentForm({
  stations,
}: {
  stations: { slug: string; name: string }[];
}) {
  const [state, formAction] = useActionState<LibraryState, FormData>(
    saveContent,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Card>
        <Eyebrow>What it is</Eyebrow>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="Title" name="title" />
          <TextArea
            label="Description"
            name="description"
            rows={3}
            required={false}
            hint="What a member gets out of it, in a line or two."
          />
          <Select
            label="Station"
            name="station_slug"
            hint="Exactly one. This is how members browse — the bucket below is a tag, not a home."
            options={[
              { value: "", label: "Choose a station" },
              ...stations.map((s) => ({ value: s.slug, label: s.name })),
            ]}
          />
        </div>
      </Card>

      <Card>
        <Eyebrow>Tagging</Eyebrow>
        <p className="mt-1 mb-3 text-caption text-navy/60">
          Both layers matter: topic organises it, job is what the recommendation
          engine reads. Untagged content browses fine and is invisible to the
          diagnostic.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Bucket"
            name="bucket"
            options={[
              { value: "", label: "None" },
              { value: "visibility", label: "Visibility" },
              { value: "launch", label: "Launch" },
              { value: "systems_delivery", label: "Systems & Delivery" },
              { value: "profit", label: "Profit" },
            ]}
          />
          <Field label="Sub-category" name="sub_category" required={false} />
          <Select
            label="Job"
            name="job"
            options={[
              { value: "", label: "None" },
              { value: "save_time", label: "Saves time" },
              { value: "make_money", label: "Makes money" },
            ]}
          />
          <Field
            label="Sort order"
            name="sort_order"
            type="number"
            required={false}
            defaultValue="0"
          />
        </div>
      </Card>

      <Card>
        <Eyebrow>Format</Eyebrow>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Select
            label="Kind"
            name="kind"
            hint="Replays and audio drops are shown differently from formal trainings."
            options={[
              { value: "training", label: "Training" },
              { value: "replay", label: "Hot seat replay" },
              { value: "audio_drop", label: "Audio drop" },
            ]}
          />
          <Select
            label="File type"
            name="format"
            hint="Shown as a badge, so nobody opens a spreadsheet expecting a video."
            options={[
              { value: "video", label: "Video" },
              { value: "pdf", label: "PDF" },
              { value: "audio", label: "Audio" },
              { value: "spreadsheet", label: "Spreadsheet" },
            ]}
          />
          <Field
            label="Asset path"
            name="asset_path"
            required={false}
            hint="Where the file lives. Serve via signed URL — never a public link."
          />
          <Field
            label="Duration (minutes)"
            name="duration_minutes"
            type="number"
            required={false}
          />
        </div>
      </Card>

      <Card>
        <Eyebrow>Visibility</Eyebrow>
        <div className="mt-2">
          <Checkbox
            label="★ Hot-seat buildable — a real artifact gets built, not just understood"
            name="is_hot_seat_buildable"
          />
          <Checkbox
            label="Available during onboarding (the starter set, or a trailer replay)"
            name="available_during_onboarding"
          />
          <Checkbox label="Publish now" name="published" />
        </div>
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />

      <SubmitButton full={false}>Save content</SubmitButton>
    </form>
  );
}
