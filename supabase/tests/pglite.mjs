/**
 * A real Postgres with every migration applied, in-process.
 *
 * Shared by the RLS suite (`schema.test.mjs`) and the server-action tests, which
 * need the same database from opposite directions: one drives SQL directly, the
 * other drives it through the app's own code. Both want the migrations to be the
 * only source of schema, so it lives here rather than being set up twice and
 * drifting.
 *
 * The `auth` and `storage` schemas below are minimal stand-ins for what Supabase
 * manages. NOT a substitute for running against the real project — grants,
 * triggers and extensions differ — but enough for policies to apply as written.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export async function createTestDatabase() {
  const db = await new PGlite();

  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create role authenticated;
    grant usage on schema public to authenticated;
    create or replace function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    -- Minimal stand-in for Supabase Storage, so the bucket policies apply here
    -- and can be exercised. foldername() mirrors Supabase's: the path segments
    -- MINUS the filename, so 'abc/photo.jpg' yields {abc} and [1] is the owner.
    create schema storage;
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      owner uuid
    );
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[]
      language plpgsql immutable as $fn$
      declare parts text[];
      begin
        select string_to_array(name, '/') into parts;
        return parts[1:array_length(parts, 1) - 1];
      end
      $fn$;
  `);

  for (const f of (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(path.join(MIGRATIONS, f), "utf8"));
  }

  // Supabase grants these automatically via default privileges; mirror that.
  await db.exec(`
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
    grant usage on schema storage to authenticated;
    grant all on storage.objects to authenticated;
  `);

  return db;
}

/** Run `fn` as a signed-in member, so RLS applies exactly as it would live. */
export async function asMember(db, uid, fn) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}
