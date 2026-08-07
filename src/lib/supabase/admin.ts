import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * Service-role client. **Bypasses RLS completely.**
 *
 * Only for work that genuinely can't run as the member — creating a member
 * record from a payment webhook, admin panel queries that span all members.
 * Everything else uses `@/lib/supabase/server`.
 *
 * The `server-only` import above makes the build fail loudly if this file ever
 * ends up in a client bundle.
 */
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
