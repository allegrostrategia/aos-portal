/**
 * Stands in for `@/lib/email/send`.
 *
 * Records what would have gone out instead of sending it, so a test can assert
 * on the recipient and the words — which is the half of these handlers that no
 * schema test can reach.
 */
let outbox = [];

export function reset() {
  outbox = [];
}

export function sent() {
  return outbox;
}

/** Configured by default: a test asserting a send shouldn't have to set it up. */
export function isEmailConfigured() {
  return true;
}

export function emailFrom() {
  return "aOS <noreply@test>";
}

let nextResult = { ok: true };

/** For testing what a handler does when delivery fails. */
export function failNextSend(error = "Resend said no") {
  nextResult = { ok: false, error };
}

export async function sendEmail({ to, subject, text }) {
  outbox.push({ to, subject, text });
  const result = nextResult;
  nextResult = { ok: true };
  return result;
}
