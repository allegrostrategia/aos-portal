import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// aOS keeps its own Management API token in .env.local, deliberately not in
// ~/.supabase/access-token: that file holds one token for the whole machine, so
// signing the CLI in to another Supabase account silently evicts this project's.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ENV_FILE = ".env.local";
export const VAR = "SUPABASE_ACCESS_TOKEN";

export async function readAccessToken({ required = true } = {}) {
  let text = "";
  try {
    text = await readFile(path.join(ROOT, ENV_FILE), "utf8");
  } catch {
    text = "";
  }
  const line = text.split(/\r?\n/).find(l => l.trimStart().startsWith(`${VAR}=`));
  const token = (line ?? "").slice((line ?? "").indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!token && required) {
    console.error(
      `No ${VAR} in ${ENV_FILE}.\n` +
      `Create a token at https://supabase.com/dashboard/account/tokens while signed in\n` +
      `to the account that owns the aOS project, then add one line to ${ENV_FILE}:\n` +
      `  ${VAR}=sbp_...\n` +
      `Nothing reads ~/.supabase/access-token any more, so a login for another\n` +
      `project cannot break this one.`
    );
    process.exit(1);
  }
  return token;
}
