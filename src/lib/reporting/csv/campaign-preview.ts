import type { CampaignFigures } from "./meta-ads.ts";
import type { PreviewRow } from "./preview.ts";

/**
 * §10.2's import, campaign by campaign.
 *
 * The ads export is one row per campaign and the Ads entry screen
 * stores per campaign too, so an import is not "fill these boxes" — it
 * is "match these rows to the campaigns that exist, and say what to do
 * about the ones that do not".
 *
 * **Matched by exact name, after trimming both sides** (Dom, 12
 * October). Whitespace at either end is an artefact of the export or of
 * somebody pasting a name in, and it is invisible on screen — refusing
 * to match on it would be refusing on something nobody can see.
 * Everything else stays strict: case, dashes and commas all count, so
 * `leads — broad, uk` is a different campaign from `Leads — broad, UK`.
 *
 * No fuzzy matching and no remembered mapping: a campaign renamed in
 * Meta reads as a new one and is offered as new. Both conveniences are
 * real and both are ways an import can quietly attach a month's spend
 * to the wrong campaign, so they are on Nina's list to be built
 * deliberately rather than early.
 *
 * **Nothing is created unless it is ticked.** An unmatched row is
 * listed with what it would bring, and does nothing at all until
 * somebody says to add it.
 */

export interface MatchedCampaign {
  entityId: string;
  name: string;
  rows: PreviewRow[];
  changed: PreviewRow[];
}

export interface UnmatchedCampaign {
  name: string;
  figures: Record<string, number>;
  goalIsLeads: boolean;
}

export interface CampaignPreview {
  matched: MatchedCampaign[];
  unmatched: UnmatchedCampaign[];
  /** Campaigns on screen the file said nothing about. */
  untouched: string[];
}

export function buildCampaignPreview(
  campaigns: CampaignFigures[],
  /** The campaigns already set up, as the screen has them. */
  existing: { id: string; name: string }[],
  /** `${metricKey}|${entityId}` → what is in that box now. */
  current: Record<string, number | null>,
  labels: Record<string, string>,
): CampaignPreview {
  // Trimmed on both sides, exact on everything else. Two campaigns
  // sharing a name is not a state the screen allows, so the first is
  // the match.
  const byName = new Map(existing.map((e) => [e.name.trim(), e]));
  const matched: MatchedCampaign[] = [];
  const unmatched: UnmatchedCampaign[] = [];
  const seen = new Set<string>();

  for (const campaign of campaigns) {
    const found = byName.get(campaign.name.trim());
    if (!found) {
      unmatched.push({
        name: campaign.name,
        figures: campaign.figures,
        goalIsLeads: campaign.goalIsLeads,
      });
      continue;
    }
    seen.add(found.id);

    const rows: PreviewRow[] = Object.entries(campaign.figures).map(([key, to]) => {
      const label = labels[key] ?? key;
      const from = current[`${key}|${found.id}`];
      if (from === null || from === undefined) return { key, label, status: "new", to };
      if (from === to) return { key, label, status: "same", to };
      return { key, label, status: "changed", from, to };
    });

    matched.push({
      entityId: found.id,
      name: found.name,
      rows,
      changed: rows.filter((row) => row.status === "changed"),
    });
  }

  return {
    matched,
    unmatched,
    // Said out loud, because a campaign the file does not mention keeps
    // whatever is in its boxes — and somebody who expected the file to
    // be the whole month should know which ones it was silent about.
    untouched: existing.filter((e) => !seen.has(e.id)).map((e) => e.name),
  };
}
