"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  HEADSHOT_ACCEPT,
  HEADSHOT_MAX_EDGE,
  headshotPathFor,
  isHeadshotFile,
} from "@/lib/directory/headshot";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

/**
 * The member's photo for the directory (§10).
 *
 * Straight from the browser to storage, like library uploads and voice notes —
 * a Server Action body is capped at a few megabytes on Vercel and a phone photo
 * routinely isn't. **Unlike the library, no signed URL is needed:** the
 * `headshots` bucket has a member insert policy scoped to their own folder, so
 * their own session is allowed to write. The library needed signing precisely
 * because that bucket has no member policy at all. Same shape, different
 * mechanism, and using the member's own session where the policy permits it is
 * what CLAUDE.md asks for.
 *
 * Resized before upload. A modern phone photo is several megapixels and this is
 * rendered at 56 pixels in a directory card — uploading the original would cost
 * the member their data allowance, the project its storage, and every other
 * member a slow directory. `imageOrientation: "from-image"` matters more than it
 * looks: without it a photo taken in portrait on a phone arrives sideways,
 * because the rotation lives in EXIF that a canvas otherwise discards.
 *
 * If any of that fails the original file uploads unchanged. A sideways or
 * oversized photo is a far better outcome than a member who can't add one.
 */

async function resizeForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, HEADSHOT_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas context");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new Error("Canvas produced nothing");
  return blob;
}

export function HeadshotField({ path }: { path: string | null }) {
  const [storedPath, setStoredPath] = useState(path ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The existing photo, fetched through a signed URL the same way the directory
  // does — the bucket is private, so there's no plain URL to show.
  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("headshots")
        .createSignedUrl(path, 60 * 60);
      if (!cancelled && data?.signedUrl) setPreview(data.signedUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  async function handleFile(file: File) {
    setError(null);

    if (!isHeadshotFile(file.name) && !file.type.startsWith("image/")) {
      setError("That doesn't look like a photo — JPEG, PNG, WebP or HEIC.");
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
      let name = file.name;
      try {
        body = await resizeForUpload(file);
        name = "photo.jpg";
      } catch {
        // Resizing is an optimisation, not a requirement.
      }

      const newPath = headshotPathFor(auth.user.id, name, crypto.randomUUID().slice(0, 8));
      const { error: uploadError } = await supabase.storage
        .from("headshots")
        .upload(newPath, body, { contentType: body.type || "image/jpeg" });

      if (uploadError) {
        setError(`The photo didn't upload: ${uploadError.message}`);
        return;
      }

      // Replacing leaves the old object behind otherwise, and nothing else ever
      // points at it. Best-effort: a stray file is cheaper than a failed save.
      if (storedPath && storedPath !== newPath) {
        await supabase.storage.from("headshots").remove([storedPath]);
      }

      setStoredPath(newPath);
      setPreview(URL.createObjectURL(body));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="headshot_path" value={storedPath} />
      <span className="text-small font-medium text-navy">Photo</span>

      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          /* A signed URL expires in an hour, so next/image's optimiser would
             cache one and keep serving it long after it stops working. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="size-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="size-16 shrink-0 rounded-full border border-dashed border-navy/25"
          />
        )}

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "One moment…" : storedPath ? "Change photo" : "Add a photo"}
        </Button>

        {storedPath && !busy ? (
          <button
            type="button"
            onClick={() => {
              setStoredPath("");
              setPreview(null);
            }}
            className="text-caption text-navy/50 underline underline-offset-4 transition hover:text-navy"
          >
            Remove
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={HEADSHOT_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <p className="text-caption text-navy/60">
        Optional, and it&rsquo;s resized before it uploads — no need to shrink it
        first.
      </p>

      <FormMessage error={error ?? undefined} />
    </div>
  );
}
