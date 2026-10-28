import { spawn } from "node:child_process";
import { readAccessToken } from "./supabase-token.mjs";

// The Supabase CLI, run with aOS's own token from .env.local. Use this (or the
// db:* scripts) rather than `npx supabase` directly.
const token = await readAccessToken();
const child = spawn("npx", ["supabase", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : code ?? 1));
