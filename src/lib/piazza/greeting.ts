import { APP_TIME_ZONE } from "../time-zone.ts";

/**
 * The greeting at the top of Piazza, by the time of day (round 4, item 3).
 *
 * UK time, like everything else. Buongiorno until midday, buon pomeriggio
 * through the afternoon, buonasera from six until the small hours. No
 * buonanotte: in Italian it's a goodbye, not a hello (Dom, 18 Sep).
 */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", hour12: false }).format(now),
  ) % 24;
  if (hour >= 5 && hour < 12) return "Buongiorno";
  if (hour >= 12 && hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}
