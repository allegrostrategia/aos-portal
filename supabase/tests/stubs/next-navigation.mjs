/**
 * `redirect()` throws in Next, and the actions rely on that to stop. Throwing a
 * recognisable error keeps that control flow and lets a test assert that an
 * unauthorised caller was turned away rather than served.
 */
export function redirect(url) {
  const error = new Error(`REDIRECT:${url}`);
  error.digest = `NEXT_REDIRECT;${url}`;
  throw error;
}
export function notFound() {
  throw new Error("NOT_FOUND");
}
