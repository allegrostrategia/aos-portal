import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Anon key, so RLS still applies — this is not an admin client.
 *
 * Create a new one per request; never hold this in a module-level variable, or
 * one member's session leaks into another's request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can't write cookies. Safe to ignore: src/proxy.ts
          // refreshes the session on every request, so the tokens stay current.
        }
      },
    },
  });
}
