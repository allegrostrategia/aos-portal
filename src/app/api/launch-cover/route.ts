import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import { STAGE_4 } from "@/lib/reporting/categories";
import { withSaved } from "@/lib/reporting/saved-notice";

/**
 * A launch's cover image (§6.1): uploading one, and taking it off again.
 *
 * **A route handler rather than a server action**, for two reasons that
 * both matter:
 *
 *   · A server action's body is capped at 1 MB by default and the bucket
 *     allows 5, so a normal photo would be refused by Next before
 *     Supabase ever saw it. A route handler has no such cap.
 *   · A plain `<form method="post" enctype="multipart/form-data">` posts
 *     to it with no JavaScript at all — the standing rule since three
 *     hydration-dependent controls in a row failed. The cover is
 *     optional (Nina's decision 12), and "optional" should not quietly
 *     mean "only if the JavaScript arrived".
 *
 * **Nothing here decides who may do this.** The upload goes through the
 * member's own session, so `launch_covers_write` answers it: the
 * workspace must be theirs to edit and the launch must not be published.
 * The same policy refuses a published launch, which is what keeps a
 * cover under the lock with everything else on the report.
 *
 * **The client is built here rather than taken from `@/lib/supabase/server`**,
 * and that is not tidiness. Supabase rotates the refresh token when it
 * refreshes a session, which invalidates the old one server-side — so if
 * the new cookies do not reach the browser, the session is dead. They do
 * not survive a hand-built `NextResponse.redirect()`, which is a fresh
 * response rather than the one Next was going to send: the first cut of
 * this route logged the person out on every upload, bouncing them to
 * `/login` with their work behind them. Every response below is built
 * through `finish()`, which copies the cookies on.
 */

const BUCKET = "launch-covers";
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Only this module's own screens, and never a host — the same check the
 *  save actions make, for the same reason. */
const RETURN_TO = /^\/reporting\/launches\/[0-9a-fA-F-]{36}\/(edit|enter)(\?[^#]*)?$/;

function backTo(raw: string, launchId: string, key: "cover" | "cover-removed") {
  const href = RETURN_TO.test(raw) ? raw : `/reporting/launches/${launchId}/edit`;
  return withSaved(href, key);
}

/**
 * 303 to a path, not to a URL.
 *
 * `NextResponse.redirect()` needs an absolute one, and the obvious
 * source — `request.nextUrl.origin` — is Next's idea of the origin,
 * which is not always the host the browser typed. In the test stack it
 * resolves to `localhost` while the browser is on `127.0.0.1`: a
 * different origin as far as cookies go, so the redirected GET arrived
 * with no session and bounced to `/login` with the upload done and
 * nothing to show for it. Behind a proxy in production the same gap
 * exists for the same reason.
 *
 * A relative `Location` has been allowed since RFC 7231 and resolves
 * against whatever the browser actually asked for, which is the only
 * origin guaranteed to hold the session.
 */
function seeOther(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/** A refusal the person can read, on the screen they were on. */
/**
 * A Supabase client whose cookie writes are collected rather than
 * assumed, and the response builder that puts them on the way out.
 */
function sessionBound() {
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const client = async () => {
    const store = await cookies();
    return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          for (const cookie of toSet) pending.push(cookie);
        },
      },
    });
  };

  /** Every response leaves through here, carrying any refreshed session. */
  const finish = (response: NextResponse) => {
    for (const { name, value, options } of pending) response.cookies.set(name, value, options);
    return response;
  };

  return { client, finish };
}

function refuse(raw: string, launchId: string, message: string) {
  const href = RETURN_TO.test(raw) ? raw : `/reporting/launches/${launchId}/edit`;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("cover_error", message);
  return `${path}?${params.toString()}`;
}

export async function POST(request: NextRequest) {
  if (!STAGE_4) return new NextResponse("Not found", { status: 404 });

  const form = await request.formData();
  const launchId = String(form.get("launch_id") ?? "");
  const returnTo = String(form.get("return_to") ?? "");
  if (!/^[0-9a-fA-F-]{36}$/.test(launchId)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const { client, finish } = sessionBound();
  const supabase = await client();

  // Which launch, and where its cover lives. Read through the member's
  // own session, so a launch that is not theirs is simply not there.
  const { data: launch } = await supabase
    .from("report_launches")
    .select("id, workspace_id, cover_image_path")
    .eq("id", launchId)
    .maybeSingle<{ id: string; workspace_id: string; cover_image_path: string | null }>();

  if (!launch) return finish(new NextResponse("Not found", { status: 404 }));

  if (String(form.get("remove") ?? "") === "1") {
    if (launch.cover_image_path) {
      const { error } = await supabase.storage.from(BUCKET).remove([launch.cover_image_path]);
      // Checked, not assumed: storage refuses a published launch, and a
      // removal that silently did nothing would leave the row pointing
      // at a file that is still there.
      if (error) {
        return finish(seeOther(refuse(returnTo, launchId, "That launch is published, so its cover can't change. Unpublish it first.")));
      }
    }
    const { data: cleared } = await supabase
      .from("report_launches")
      .update({ cover_image_path: null })
      .eq("id", launchId)
      .select("id");
    if (!cleared || cleared.length === 0) {
      return finish(seeOther(refuse(returnTo, launchId, "That launch isn't yours to change.")));
    }
    return finish(seeOther(backTo(returnTo, launchId, "cover-removed")));
  }

  const file = form.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return finish(seeOther(refuse(returnTo, launchId, "Choose an image first.")));
  }

  const extension = TYPES[file.type];
  if (!extension) {
    return finish(seeOther(refuse(returnTo, launchId, "That has to be a JPEG, PNG or WebP.")));
  }
  if (file.size > MAX_BYTES) {
    return finish(seeOther(refuse(returnTo, launchId, "That image is over 5 MB. Try a smaller one.")));
  }

  // `<workspace>/<launch>.<ext>`, which is the shape the storage policies
  // read the two ids out of. One file per launch, overwritten in place.
  const path = `${launch.workspace_id}/${launchId}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return finish(seeOther(refuse(returnTo, launchId, "That launch is published, so its cover can't change. Unpublish it first.")));
  }

  // A different format leaves the old file behind, because the extension
  // is part of the name. Remove it rather than let it sit in the bucket
  // unreferenced.
  if (launch.cover_image_path && launch.cover_image_path !== path) {
    await supabase.storage.from(BUCKET).remove([launch.cover_image_path]);
  }

  const { data: saved } = await supabase
    .from("report_launches")
    .update({ cover_image_path: path })
    .eq("id", launchId)
    .select("id");

  if (!saved || saved.length === 0) {
    return finish(seeOther(refuse(returnTo, launchId, "That launch isn't yours to change.")));
  }

  return finish(
    seeOther(backTo(returnTo, launchId, "cover")),
  );
}
