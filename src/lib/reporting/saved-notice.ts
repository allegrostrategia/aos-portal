/**
 * The confirmation a save leaves behind, carried in the URL.
 *
 * **Why not `useActionState`'s return value.** It was the return value,
 * and a full-suite run under load caught it disappearing: the POST
 * succeeded — 200 in the server log — and "Status saved." never
 * appeared. The form had submitted natively, before React attached, so
 * the page navigated and the action's state went with it. A save that
 * works and says nothing is the exact shape of bug this project has been
 * caught by three times, and a person's answer to it is to press the
 * button again.
 *
 * So a successful save redirects to `?saved=<key>` and the **page**
 * renders the sentence. It does not depend on hydration, on the action's
 * return value surviving, or on JavaScript at all. It also survives a
 * reload and a shared link, which the old one did not.
 *
 * Errors still come back through the action's return value, because an
 * error should leave the person on the page with what they typed still
 * in the boxes — a redirect would throw it away.
 *
 * Keys rather than sentences in the URL: the wording stays here where it
 * can be changed in one place, and nothing a person pastes into the
 * address bar can put words on the screen.
 */

export const SAVED_NOTICES = {
  launch: "Saved.",
  status: "Status saved.",
  stages: "Stages saved.",
  prices: "Price options saved.",
  figures: "Figures saved.",
  nothing: "Nothing to save.",
  cover: "Cover image saved.",
  "cover-removed": "Cover image removed.",
  settings: "Saved.",
  sections: "Sections saved.",
} as const;

export type SavedKey = keyof typeof SAVED_NOTICES;

/** The sentence for `?saved=`, or null for anything unrecognised. */
export function savedNotice(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  // `Object.hasOwn`, never `in`: `in` walks the prototype chain, so
  // `?saved=constructor` came back with the Object constructor itself
  // rather than null — found by a test that tried it.
  return Object.hasOwn(SAVED_NOTICES, raw) ? SAVED_NOTICES[raw as SavedKey] : null;
}

/**
 * Add `?saved=` to a path that may already carry `?workspace=` and
 * `?month=`.
 *
 * Replaces any `saved` already there rather than appending a second one,
 * so saving twice does not grow the URL.
 */
export function withSaved(href: string, key: SavedKey): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("saved", key);
  return `${path}?${params.toString()}`;
}
