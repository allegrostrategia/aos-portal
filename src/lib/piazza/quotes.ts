/**
 * The quote of the day (L'Editoriale "02 Piazza").
 *
 * Chosen by the date, not at random, so everyone sees the same line on the
 * same day and a refresh doesn't change it. Short, and in the register the
 * reference uses — "Discipline creates the freedom you want."
 *
 * One line, Nina's (round 4, item 7). The placeholders that rotated before
 * are gone; the rotation stays, so a second line is one more entry here.
 */
const QUOTES = [
  "Time reclaimed, freedom every day.",
];

export function quoteOfTheDay(date = new Date()): string {
  const day = Math.floor(date.getTime() / 86_400_000);
  return QUOTES[day % QUOTES.length];
}
