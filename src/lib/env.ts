/**
 * Environment access for aOS.
 *
 * Values are read through getters rather than at module load, so the app still
 * builds and runs before real Supabase credentials exist — useful during
 * scaffolding, and it means a missing variable fails at the point of use with a
 * message that says what to do about it.
 *
 * `NEXT_PUBLIC_*` is inlined into the client bundle at build time, which is why
 * each one is written as a full literal `process.env.NEXT_PUBLIC_…` expression.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },

  get supabaseAnonKey(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },

  /**
   * Never import this from anything that reaches the browser — it bypasses RLS
   * entirely. Only `src/lib/supabase/admin.ts` should read it.
   */
  get supabaseServiceRoleKey(): string {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },

  /**
   * The app's own public origin, e.g. https://aos.allegrostrategia.com.
   *
   * Needed for the links in Supabase's invitation and password-reset emails. The
   * request's `origin` header is used first where there is one; this is the
   * fallback, because a Server Action without that header would otherwise build a
   * relative redirect URL that Supabase rejects.
   */
  get siteUrl(): string | undefined {
    return process.env.NEXT_PUBLIC_SITE_URL;
  },

  /**
   * True once both public Supabase variables are set. Lets the proxy and any
   * pre-auth screens degrade gracefully instead of throwing on every request
   * while the project is still being wired up.
   */
  get isSupabaseConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
};
