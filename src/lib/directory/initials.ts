/**
 * "Fran Doyle" → "FD". Stands in for a headshot rather than leaving a hole.
 *
 * Its own module, free of server imports, so the unit runner can reach it —
 * `queries.ts` pulls in the Supabase server client and `server-only`, neither of
 * which loads under plain Node. Same split as `timer/format` and `install/state`.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  const letters = [parts[0], parts.length > 1 ? parts[parts.length - 1] : ""]
    .filter(Boolean)
    // Spread rather than charAt. Accented Latin and most scripts are single
    // UTF-16 units and would survive either way — the difference is characters
    // outside the basic plane, where charAt returns half a surrogate pair and
    // renders as a replacement glyph. Rare in a name, and free to get right.
    .map((part) => [...part][0] ?? "");

  return letters.join("").toUpperCase();
}
