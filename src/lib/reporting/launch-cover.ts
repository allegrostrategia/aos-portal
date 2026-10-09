import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * A readable link to a launch's cover, or null.
 *
 * Signed through the **member's own session**, never the service role,
 * so `launch_covers_read` decides: a retainer client gets a link to a
 * published launch's cover and nothing for a draft's, which is the same
 * answer the launch itself gives them. Signing with the admin client
 * would have handed out a link the policies were written to refuse.
 *
 * Null on any failure rather than throwing — a missing picture is not a
 * reason for a report to be a stack trace.
 */
export async function signLaunchCover(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("launch-covers")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
