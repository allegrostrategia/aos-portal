"use client";

import { useActionState, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/upload/resize";
import { saveTemplate, type SopState } from "@/lib/sop/actions";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { Field, FormMessage } from "@/components/ui/form";

/**
 * Save a screenshot of something built in Tools (L'Editoriale §6).
 *
 * The picture goes straight from the browser into the member's own folder of
 * the private `archivio` bucket, resized first — a full-resolution screenshot
 * of a spreadsheet is a lot of pixels for something read on a phone. Then the
 * form saves the row that points at it. Same two-step shape as headshots.
 */
const MAX_EDGE = 1600;

export function TemplateForm() {
  const [state, formAction] = useActionState<SopState, FormData>(saveTemplate, null);
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like a picture — a screenshot, JPEG or PNG.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setError("Signed out. Reload and try again.");
        return;
      }

      let body: Blob = file;
      try {
        body = await resizeImage(file, MAX_EDGE, 0.9);
      } catch {
        // Resizing is an optimisation, not a requirement.
      }

      const newPath = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("archivio")
        .upload(newPath, body, { contentType: body.type || "image/jpeg" });

      if (uploadError) {
        setError(`The picture didn't upload: ${uploadError.message}`);
        return;
      }

      // A replaced picture leaves the old object behind otherwise.
      if (path && path !== newPath) {
        await supabase.storage.from("archivio").remove([path]);
      }
      setPath(newPath);
      setPreview(URL.createObjectURL(body));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="image_path" value={path} />

      <Card>
        <Eyebrow>The picture</Eyebrow>
        <div className="mt-3 flex flex-col gap-3">
          {preview ? (
            // A blob URL for the preview; the saved entry loads a signed URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-80 w-full rounded-xl object-contain bg-cream-deep" />
          ) : (
            <p className="text-small text-ink/60">
              A screenshot of what you built — a pricing table, an offer sheet, a
              template you filled in.
            </p>
          )}
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-full border border-ink/15 bg-card px-4 py-2 text-small font-medium text-ink transition hover:border-ink/30">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {busy ? "Uploading…" : preview ? "Choose a different picture" : "Choose a picture"}
          </label>
          {error ? <p className="text-caption text-deep-red">{error}</p> : null}
        </div>
      </Card>

      <Card>
        <Eyebrow>What it is</Eyebrow>
        <div className="mt-3">
          <Field
            label="Name it"
            name="title"
            placeholder="Pricing table, September"
            hint="What you'd call it when looking for it later."
          />
        </div>
      </Card>

      <FormMessage error={state?.error} notice={state?.notice} />
      <Button type="submit" size="lg" disabled={busy || !path} className="self-start">
        Save to Archivio
      </Button>
    </form>
  );
}
