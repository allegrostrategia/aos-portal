/**
 * Stands in for `@/lib/supabase/server`, which would otherwise reach for
 * next/headers and a real Supabase project. Configured by the test before the
 * action module is imported.
 */
import { createShimClient } from "../supabase-shim.mjs";

let current = null;

export function configure(db, uid) {
  current = { db, uid };
}

export async function createClient() {
  if (!current) throw new Error("Supabase shim used before configure()");
  return createShimClient(current.db, current.uid);
}
