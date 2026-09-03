/**
 * Stands in for `@/lib/supabase/admin` — the service-role client.
 *
 * Shares the database the member-facing stub was configured with, but runs with
 * no role set, so RLS doesn't apply. That's what the real service role does, and
 * it's the difference that matters here: code reaching for this client is code
 * no member session could run.
 */
import { createShimClient } from "../supabase-shim.mjs";
import { database } from "./supabase-server.mjs";

export function createAdminClient() {
  return createShimClient(database(), null);
}
