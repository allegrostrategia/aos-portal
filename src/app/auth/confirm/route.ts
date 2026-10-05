import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/landing";
import { resolveNextPath } from "@/lib/auth/landing-session";

/**
 * Where every emailed auth link lands: the invitation that starts a member off,
 * and password resets.
 *
 * Members are created by admin and invited by email — there is no self-signup —
 * so this route is the only way anyone gets their first session.
 *
 * Supabase sends either `token_hash` + `type` or a PKCE `code` depending on the
 * flow and the email template, so both are handled.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  // Defaults to the root, which decides which door this login has. A
  // default of /piazza sends every reporting client to /no-access.
  const rawNext = searchParams.get("next") ?? "/";
  const next = safeNextPath(rawNext);

  const supabase = await createClient();

  // An emailed link's `next` is one we set, so it is /set-password or "/" —
  // but this is the other door that completes a sign-in, and the last time
  // the two doors disagreed about a destination a retainer client's first
  // sign-in landed on /no-access. They agree here.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(await resolveNextPath(supabase, next));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(await resolveNextPath(supabase, next));
  }

  // Expired or already-used links land here. The message on /login says as much,
  // rather than leaving someone staring at a form that keeps rejecting them.
  redirect("/login?error=link");
}
