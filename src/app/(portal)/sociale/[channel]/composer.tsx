"use client";

import { useActionState, useRef, useState } from "react";

import { sendMessage, type ChatState } from "@/lib/chat/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form";

/**
 * Writing a message, or recording one.
 *
 * Voice is a real requirement rather than a flourish (§4): Nina's Monday
 * touchpoint is a voice note before 9am, so the product doesn't work without it.
 *
 * The audio goes straight from here to storage. A Server Action body is capped
 * at a few megabytes on Vercel and a minute of audio doesn't reliably fit, so
 * the same browser-to-storage shape as library uploads applies — except this
 * bucket does have a member policy (own folder only), so the browser's own
 * session can write and no signed URL is needed.
 */

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

type Recording = { blob: Blob; seconds: number; url: string };

export function Composer({
  channelId,
  builds,
}: {
  channelId: string;
  builds: { id: string; title: string }[];
}) {
  const [state, formAction] = useActionState<ChatState, FormData>(
    sendMessage,
    null,
  );

  const [recording, setRecording] = useState<Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState("");
  const [buildId, setBuildId] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });

      recorder.addEventListener("stop", () => {
        // Release the microphone straight away — a tab holding it open after
        // recording shows a recording indicator and reads as spyware.
        stream.getTracks().forEach((track) => track.stop());
        if (tickRef.current) clearInterval(tickRef.current);

        const blob = new Blob(chunks, { type: recorder.mimeType });
        const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        setRecording({ blob, seconds, url: URL.createObjectURL(blob) });
        setIsRecording(false);
      });

      startedAtRef.current = Date.now();
      setElapsed(0);
      tickRef.current = setInterval(
        () => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)),
        250,
      );

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setUploadError(
        "Couldn't reach the microphone. Check the browser has permission.",
      );
    }
  }

  async function uploadIfNeeded(): Promise<boolean> {
    if (!recording || uploadedPath) return true;

    setUploadError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setUploadError("Signed out. Reload and try again.");
      return false;
    }

    const extension = recording.blob.type.includes("mp4") ? "m4a" : "webm";
    // Own folder: the storage policy requires it, and the server checks it again
    // before the path is written into a row other people read.
    const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;

    const { error } = await supabase.storage
      .from("voice-messages")
      .upload(path, recording.blob, { contentType: recording.blob.type });

    if (error) {
      setUploadError(`The recording didn't upload: ${error.message}`);
      return false;
    }

    setUploadedPath(path);
    return true;
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        // The audio has to be in storage before the row referencing it exists,
        // or the message points at a file that isn't there yet.
        if (recording && !uploadedPath) {
          event.preventDefault();
          void uploadIfNeeded().then((ok) => {
            if (ok) event.currentTarget?.requestSubmit();
          });
        }
      }}
      className="flex flex-col gap-3 border-t border-navy/10 bg-white/60 p-4"
    >
      <input type="hidden" name="channel_id" value={channelId} />
      <input type="hidden" name="voice_path" value={uploadedPath} />
      <input type="hidden" name="voice_seconds" value={recording?.seconds ?? ""} />

      <textarea
        name="body"
        rows={2}
        placeholder="Write something…"
        className="w-full rounded-md border border-navy/15 bg-white px-3 py-2.5 text-body text-navy placeholder:text-navy/40"
      />

      {recording ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-sky/40 bg-sky/10 px-3 py-2">
          <audio controls src={recording.url} className="h-9 max-w-full" />
          <span className="font-mono text-caption text-navy/60">
            {recording.seconds}s
          </span>
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(recording.url);
              setRecording(null);
              setUploadedPath("");
            }}
            className="text-caption text-navy/50 underline underline-offset-4 transition hover:text-navy"
          >
            Discard
          </button>
        </div>
      ) : null}

      {builds.length > 0 ? (
        <details className="text-small">
          <summary className="cursor-pointer list-none text-caption text-navy/60 underline underline-offset-4">
            Is this about one of your builds?
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <select
              name="handover_pack_id"
              value={buildId}
              onChange={(event) => setBuildId(event.target.value)}
              className="w-full rounded-md border border-navy/15 bg-white px-3 py-2 text-small text-navy"
            >
              <option value="">Not about a specific build</option>
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.title}
                </option>
              ))}
            </select>

            {/* Off by default and never required to send — the toggle only
                appears once a build is chosen, because it is consent to reuse
                that answer rather than anything else written here. */}
            {buildId ? (
              <label className="flex items-start gap-2.5 py-1 text-small text-navy">
                <input
                  type="checkbox"
                  name="testimonial_consent"
                  className="mt-0.5 size-4 accent-navy"
                />
                Nina can quote this update. Entirely optional — your answer counts
                either way.
              </label>
            ) : null}
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm">
          Send
        </Button>

        {isRecording ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => recorderRef.current?.stop()}
          >
            Stop · {elapsed}s
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void startRecording()}
          >
            {recording ? "Record again" : "Record a voice note"}
          </Button>
        )}
      </div>

      <FormMessage error={uploadError ?? state?.error} />
    </form>
  );
}
