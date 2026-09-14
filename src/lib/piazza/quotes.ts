/**
 * The quote of the day (L'Editoriale "02 Piazza").
 *
 * Chosen by the date, not at random, so everyone sees the same line on the
 * same day and a refresh doesn't change it. Short, and in the register the
 * reference uses — "Discipline creates the freedom you want."
 *
 * **These are placeholders in the brand's voice, not Nina's words.** She
 * should own this list — it is the first sentence a member reads every day.
 * Replacing it is editing one array.
 */
const QUOTES = [
  "Discipline creates the freedom you want.",
  "Small consistent steps create extraordinary results.",
  "One real thing, built, beats ten things planned.",
  "Your week already knows what to fix. Track it.",
  "Systems are how you stop being the bottleneck.",
  "Same dreams. More done.",
  "Build it once, properly. Then let it run.",
];

export function quoteOfTheDay(date = new Date()): string {
  const day = Math.floor(date.getTime() / 86_400_000);
  return QUOTES[day % QUOTES.length];
}
