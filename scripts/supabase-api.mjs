import { readAccessToken } from "./supabase-token.mjs";

// A Management API call with aOS's own token:
//   node scripts/supabase-api.mjs /v1/projects
//   node scripts/supabase-api.mjs /v1/projects/<ref>/database/query POST '{"query":"select 1"}'
const [route, method = "GET", body] = process.argv.slice(2);
if (!route) {
  console.error("usage: node scripts/supabase-api.mjs <path> [method] [json body]");
  process.exit(1);
}
const token = await readAccessToken();
const res = await fetch(`https://api.supabase.com${route}`, {
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    ...(body ? { "Content-Type": "application/json" } : {}),
  },
  body,
});
const text = await res.text();
if (!res.ok) {
  console.error(`${res.status} ${res.statusText}\n${text}`);
  process.exit(1);
}
console.log(text);
