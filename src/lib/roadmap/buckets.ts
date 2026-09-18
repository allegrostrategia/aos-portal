import type { ActionBucket } from "./shape.ts";

/**
 * The bucket pills on La Strada, in The Map's colours exactly (brief: "no
 * new colours"). The Map paints Profit in the deep red it defined for the
 * terracotta roofs, not blush; the brief's legend text says blush. The Map
 * wins, since matching it is the stated rule; one line here if that's wrong.
 */
export const BUCKET_PILL: Record<ActionBucket, { label: string; legend: string; colour: string; text: string }> = {
  visibility: { label: "Visibility", legend: "Visibility", colour: "var(--aos-sky)", text: "text-ink" },
  launch: { label: "Offers", legend: "Launch & Offers", colour: "var(--aos-orange)", text: "text-ink" },
  systems_delivery: { label: "Systems", legend: "Systems & Delivery", colour: "var(--aos-gold)", text: "text-ink" },
  profit: { label: "Profit", legend: "Profit & Pricing", colour: "var(--aos-deep-red)", text: "text-white" },
};

export const BUCKET_ORDER: ActionBucket[] = ["visibility", "launch", "systems_delivery", "profit"];
