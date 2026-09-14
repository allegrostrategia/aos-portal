/** Stands in for `next/server`'s `after`: run the work now, so a test can assert on it. */
export function after(fn) {
  const r = typeof fn === "function" ? fn() : fn;
  if (r && typeof r.then === "function") pending.push(r);
}
const pending = [];
/** Await everything `after()` queued. */
export async function flushAfter() {
  await Promise.all(pending.splice(0));
}
export class NextResponse {}
