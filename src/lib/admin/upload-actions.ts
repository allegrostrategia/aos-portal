"use server";

import { requireAdmin } from "@/lib/auth/member";
import { createClient } from "@/lib/supabase/server";
import {
  assetPathFor,
  formatForFilename,
  type ContentFormat,
} from "@/lib/library/assets";

/**
 * Uploading library files (§7).
 *
 * The file never passes through the server. The browser asks for permission to
 * write one specific object, gets a short-lived signed upload URL back, and PUTs
 * the bytes straight to Supabase Storage.
 *
 * That isn't an optimisation, it's the only shape that works: a Server Action
 * body is capped at a few megabytes on Vercel, and Nina's trainings are videos —
 * routinely hundreds. Proxying them would fail on the first real upload.
 *
 * What the server keeps is the decision: who may upload (admins only) and where
 * it lands. The browser never names its own path, so nothing can be written
 * outside a station prefix, and `training-content` stays private with no member
 * policy at all — §11's export rule is unchanged by any of this, since reads
 * still only happen through `/api/content/[id]`.
 *
 * No service-role client here on purpose. The storage policy already grants
 * admins write access to this bucket, so the admin's own session can sign the
 * upload — and the rule stays in one place rather than being restated in code
 * that bypasses it.
 */

export type UploadTicket = {
  signedUrl: string;
  path: string;
  format: ContentFormat;
};

export type TicketResult = { ticket: UploadTicket } | { error: string };

export async function createUploadTicket({
  stationSlug,
  filename,
}: {
  stationSlug: string;
  filename: string;
}): Promise<TicketResult> {
  await requireAdmin();

  // The station is picked before the file, not after: it decides the folder, and
  // it's required on the record anyway. Filing everything unsorted and moving it
  // later is the version of this that never gets tidied up.
  if (!stationSlug) {
    return {
      error:
        "Pick a station first — that's the folder the file goes in, as well as where the training lives.",
    };
  }

  const format = formatForFilename(filename);
  if (!format) {
    return {
      error:
        "That file type isn't one the library serves. Video, audio, PDF or spreadsheet.",
    };
  }

  const supabase = await createClient();

  // Guards against a station slug arriving from anywhere but the real list — the
  // path is built from it, so it decides where bytes land.
  const { data: station } = await supabase
    .from("stations")
    .select("slug")
    .eq("slug", stationSlug)
    .maybeSingle();

  if (!station) return { error: "That isn't a station." };

  const path = assetPathFor(stationSlug, filename, crypto.randomUUID().slice(0, 8));

  const { data, error } = await supabase.storage
    .from("training-content")
    .createSignedUploadUrl(path);

  if (error || !data?.signedUrl) {
    return {
      error: error?.message ?? "Couldn't start the upload. Try again.",
    };
  }

  return { ticket: { signedUrl: data.signedUrl, path, format } };
}
