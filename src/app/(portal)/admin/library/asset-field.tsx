"use client";

import { useRef, useState } from "react";

import { createUploadTicket } from "@/lib/admin/upload-actions";
import {
  UPLOAD_ACCEPT,
  prettyBytes,
  type ContentFormat,
} from "@/lib/library/assets";
import { Button } from "@/components/ui/button";

/**
 * The file on a piece of library content.
 *
 * Replaces typing `asset_path` by hand and putting the file in the bucket
 * through Supabase's dashboard first — two steps in two places, where getting
 * either one slightly wrong produced a row pointing at nothing.
 *
 * The bytes go straight from here to storage (see `createUploadTicket` for why),
 * so this is a real XHR rather than a form post: `fetch` still can't report
 * upload progress, and a 400MB training uploading behind a spinner with no
 * indication of progress is indistinguishable from one that has hung.
 *
 * The request body matches what supabase-js sends for a signed upload — a PUT
 * with `cacheControl` and the file under an empty field name — because the
 * storage endpoint expects that shape, not a bare body.
 */

type Phase =
  | { state: "idle" }
  | { state: "uploading"; percent: number; name: string; size: number }
  | { state: "error"; message: string };

const CACHE_CONTROL_SECONDS = "3600";

function upload(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): { promise: Promise<void>; cancel: () => void } {
  const request = new XMLHttpRequest();

  const promise = new Promise<void>((resolve, reject) => {
    request.open("PUT", signedUrl);
    request.setRequestHeader("x-upsert", "false");

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      // Storage answers with JSON when it refuses — a file over the bucket's
      // size limit, most often. Its own words beat a generic failure here.
      let message = `Upload failed (${request.status}).`;
      try {
        const body = JSON.parse(request.responseText) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // Not JSON. The status on its own will have to do.
      }
      reject(new Error(message));
    });

    request.addEventListener("error", () =>
      reject(new Error("The upload couldn't reach storage. Check the connection.")),
    );
    request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

    const body = new FormData();
    body.append("cacheControl", CACHE_CONTROL_SECONDS);
    body.append("", file);
    request.send(body);
  });

  return { promise, cancel: () => request.abort() };
}

export function AssetField({
  stationSlug,
  defaultPath,
  onFormatDetected,
  onUploadingChange,
}: {
  stationSlug: string;
  defaultPath: string | null;
  onFormatDetected: (format: ContentFormat) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [path, setPath] = useState(defaultPath ?? "");
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  async function handleFile(file: File) {
    setPhase({ state: "uploading", percent: 0, name: file.name, size: file.size });
    onUploadingChange(true);

    try {
      const result = await createUploadTicket({
        stationSlug,
        filename: file.name,
      });

      if ("error" in result) {
        setPhase({ state: "error", message: result.error });
        return;
      }

      const { promise, cancel } = upload(
        result.ticket.signedUrl,
        file,
        (percent) =>
          setPhase({
            state: "uploading",
            percent,
            name: file.name,
            size: file.size,
          }),
      );
      cancelRef.current = cancel;
      await promise;

      setPath(result.ticket.path);
      // The badge members see comes from `format`, so it follows the file
      // rather than waiting to be set by hand and disagreeing with it.
      onFormatDetected(result.ticket.format);
      setPhase({ state: "idle" });
    } catch (error) {
      setPhase({
        state: "error",
        message: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      cancelRef.current = null;
      onUploadingChange(false);
      // Lets the same file be picked again after a failure — without this the
      // input's value is unchanged and `change` never fires a second time.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const uploading = phase.state === "uploading";

  return (
    <div className="sm:col-span-2 flex flex-col gap-2">
      {/* `asset_path` is still what gets saved — the picker sets it instead of
          Nina typing it, and the record's shape is unchanged. */}
      <input type="hidden" name="asset_path" value={path} />

      <span className="text-small font-medium text-navy">File</span>

      {path && !uploading ? (
        <div className="rounded-md border border-navy/15 bg-white px-3 py-2.5">
          <p className="font-mono text-caption break-all text-navy">{path}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-caption text-navy underline decoration-orange decoration-2 underline-offset-4"
            >
              Replace file
            </button>
            <button
              type="button"
              onClick={() => setPath("")}
              className="text-caption text-navy/50 underline underline-offset-4 transition hover:text-navy"
            >
              Detach
            </button>
          </div>
        </div>
      ) : null}

      {uploading ? (
        <div
          className="rounded-md border border-navy/15 bg-white px-3 py-2.5"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-small break-all text-navy">{phase.name}</p>
            <p className="font-mono text-caption whitespace-nowrap text-navy/70">
              {phase.percent}% of {prettyBytes(phase.size)}
            </p>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy/10"
            role="progressbar"
            aria-valuenow={phase.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          >
            <div
              className="h-full rounded-full bg-orange transition-[width]"
              style={{ width: `${phase.percent}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => cancelRef.current?.()}
            className="mt-2 text-caption text-navy/50 underline underline-offset-4 transition hover:text-navy"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {!path && !uploading ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          className="self-start"
        >
          Choose a file
        </Button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        // Not `name`d, so the file itself is never part of the form submission —
        // it has already gone to storage by the time anything is saved.
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {phase.state === "error" ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-orange/30 bg-blush/25 px-3 py-2 text-small text-navy"
        >
          {phase.message}
        </p>
      ) : null}

      <p className="text-caption text-navy/60">
        {stationSlug
          ? "Video, audio, PDF or spreadsheet. It uploads straight away — saving the form is what attaches it."
          : "Pick a station above first; it decides where the file is filed."}
      </p>
    </div>
  );
}
