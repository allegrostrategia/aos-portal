import "server-only";

import type { createClient } from "@/lib/supabase/server";
import {
  landingPath,
  usableNextPath,
  type Landing,
  type LandingInput,
} from "./landing";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Which door the current session has.
 *
 * The same question the root page answers, asked here because a `?next=`
 * cannot be judged without it. Two small reads rather than
 * getCurrentMember()/getReportUser(): those are cached per request, and this
 * runs in the request that just changed who is signed in.
 */
export async function landingForSession(
  supabase: SupabaseClient,
): Promise<Landing> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "/login";

  const [member, grants] = await Promise.all([
    supabase.from("members").select("status").eq("id", user.id).maybeSingle(),
    // RLS returns this login's own grants, so one row is enough to answer.
    supabase.from("report_access").select("workspace_id").limit(1),
  ]);

  return landingPath({
    memberStatus: (member.data?.status as LandingInput["memberStatus"]) ?? null,
    hasReportAccess: (grants.data?.length ?? 0) > 0,
    signedIn: true,
  });
}

/**
 * Where to send somebody who has just signed in, given the `?next=` they
 * arrived with.
 *
 * Both places that complete an authentication call this — the sign-in action
 * and the emailed-link route — because `next` being internal is not the same
 * as `next` being theirs to use. The proxy sets it to whatever page was
 * asked for while signed out, so a stale tab can carry a reporting client to
 * a members-only screen or to /no-access itself. Dom hit exactly that on
 * 5 October: signed in as a retainer client, landed on "Your account isn't
 * ready yet", and the report was one URL away.
 *
 * The lookup only happens when there is something to judge; a bare "/" is
 * already the right answer and the root page decides from there.
 */
export async function resolveNextPath(
  supabase: SupabaseClient,
  next: string,
): Promise<string> {
  if (next === "/") return "/";
  return usableNextPath(next, await landingForSession(supabase));
}
