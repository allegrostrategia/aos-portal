"use client";

import { useActionState, useState } from "react";

import { saveContent, type LibraryState } from "@/lib/admin/library-actions";
import { Checkbox, Field, FormMessage, SubmitButton, TextArea } from "@/components/ui/form";
import { Card, Eyebrow } from "@/components/ui/card";
import type { ContentFormat } from "@/lib/library/assets";
import type { TrainingContent } from "@/lib/library/queries";
import { AssetField } from "./asset-field";

const SELECT =
  "w-full rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy";

function Select({
  label,
  name,
  options,
  hint,
  ...props
}: React.ComponentProps<"select"> & {
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
      <select id={name} name={name} className={SELECT} {...props}>
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
  editing,
}: {
  stations: { slug: string; name: string }[];
  editing?: TrainingContent | null;
}) {
  const [state, formAction] = useActionState<LibraryState, FormData>(
    saveContent,
    null,
  );

  // Station and format are controlled because the file picker reads one and
  // writes the other: the station decides where the upload is filed, and the
  // uploaded file decides the format badge members see.
  const [stationSlug, setStationSlug] = useState(editing?.station_slug ?? "");
  const [format, setFormat] = useState<ContentFormat>(
    editing?.format ?? "video",
  );
  const [uploading, setUploading] = useState(false);

  // `key` remounts the form when the edited item changes, so defaultValues are
  // re-applied. Without it, switching from one item to another would leave the
  // previous one's text in the fields.
  return (
    <form
      key={editing?.id ?? "new"}
      action={formAction}
      className="flex flex-col gap-4"
    >
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

      {editing ? (
        <div className="rounded-xl border-2 border-orange/40 bg-blush/15 px-5 py-3">
          <p className="text-body text-navy">
            Editing <strong className="font-medium">{editing.title}</strong>
          </p>
          <a
            href="/admin/library"
            className="text-caption text-navy/60 underline underline-offset-4"
          >
            Cancel and add something new instead
          </a>
        </div>
      ) : null}

      <Card>
        <Eyebrow>What it is</Eyebrow>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="Title" name="title" defaultValue={editing?.title ?? ""} />
          <TextArea
            label="Description"
            name="description"
            rows={3}
            required={false}
            defaultValue={editing?.description ?? ""}
            hint="What a member gets out of it, in a line or two."
          />
          <Select
            label="Station"
            name="station_slug"
            value={stationSlug}
            onChange={(event) => setStationSlug(event.target.value)}
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
            defaultValue={editing?.bucket ?? ""}
            options={[
              { value: "", label: "None" },
              { value: "visibility", label: "Visibility" },
              { value: "launch", label: "Launch" },
              { value: "systems_delivery", label: "Systems & Delivery" },
              { value: "profit", label: "Profit" },
            ]}
          />
          <Field label="Sub-category" name="sub_category" required={false} defaultValue={editing?.sub_category ?? ""} />
          <Select
            label="Job"
            name="job"
            defaultValue={editing?.job ?? ""}
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
            defaultValue={String(editing?.sort_order ?? 0)}
          />
        </div>
      </Card>

      <Card>
        <Eyebrow>Format</Eyebrow>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <AssetField
            stationSlug={stationSlug}
            defaultPath={editing?.asset_path ?? null}
            onFormatDetected={setFormat}
            onUploadingChange={setUploading}
          />
          <Select
            label="Kind"
            name="kind"
            defaultValue={editing?.kind ?? "training"}
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
            value={format}
            onChange={(event) => setFormat(event.target.value as ContentFormat)}
            hint="Set from the file when one is uploaded — change it only if that read it wrong."
            options={[
              { value: "video", label: "Video" },
              { value: "pdf", label: "PDF" },
              { value: "audio", label: "Audio" },
              { value: "spreadsheet", label: "Spreadsheet" },
            ]}
          />
          <Field
            label="Duration (minutes)"
            name="duration_minutes"
            type="number"
            required={false}
            defaultValue={editing?.duration_minutes ? String(editing.duration_minutes) : ""}
          />
        </div>
      </Card>

      <Card>
        <Eyebrow>Visibility</Eyebrow>
        <div className="mt-2">
          <Checkbox
            label="★ Hot-seat buildable — a real artifact gets built, not just understood"
            name="is_hot_seat_buildable"
            defaultChecked={editing?.is_hot_seat_buildable ?? false}
          />
          <Checkbox
            label="Available during onboarding (the starter set, or a trailer replay)"
            name="available_during_onboarding"
            defaultChecked={editing?.available_during_onboarding ?? false}
          />
          <Checkbox label="Published" name="published" defaultChecked={Boolean(editing?.published_at)} />
        </div>
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />

      {/* Saving mid-upload would store a path whose file isn't there yet, and
          the record would look fine while failing for the first member to open
          it. */}
      <SubmitButton full={false} disabled={uploading}>
        {uploading ? "Waiting for the upload…" : editing ? "Save changes" : "Add content"}
      </SubmitButton>
    </form>
  );
}
