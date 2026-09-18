import { APP_TIME_ZONE } from "../time-zone.ts";

/**
 * The greeting at the top of Piazza, by the time of day (round 4, item 3).
 *
 * UK time, like everything else. Buongiorno until midday, buon pomeriggio
 * through the afternoon, buonasera from six. From ten at night until five
 * it says buonanotte, which in Italian is a goodbye rather than a hello:
 * somebody opening the app at one in the morning is being told, gently, to
 * stop. Kept on purpose (Dom, 18 Sep, after the point was raised).
 */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", hour12: false }).format(now),
  ) % 24;
  if (hour >= 22 || hour < 5) return "Buonanotte";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}
