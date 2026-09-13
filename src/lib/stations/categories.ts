/**
 * What each station is about, in two or three words — the line under the name
 * in the list view ("La Boutique / Offers & Pricing").
 *
 * Code-side rather than a column, because it is fixed reference copy from
 * CLAUDE.md's station list and has no reason to vary per environment. If a
 * twelfth station ever arrives it gets a row here and a row in the seed.
 */
export const STATION_CATEGORY: Record<string, string> = {
  "grand-hotel-riposo": "Onboarding & Orientation",
  "studio-dell-architetto": "Systems & Delivery",
  "officina-vespa": "Automation",
  "cinema-allegro": "Visibility",
  "piazza-caffe": "Leads & Nurture",
  "la-boutique": "Offers & Pricing",
  "banco-allegro": "Data & Money",
  "stazione-centrale": "Launches",
  "terrazza": "In-Person & Events",
  "club-allegro": "Membership Design",
  "archivio": "Your own archive",
};

export function stationCategory(slug: string): string | null {
  return STATION_CATEGORY[slug] ?? null;
}
