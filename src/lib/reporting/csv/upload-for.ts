import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { UploadPlatform } from "@/components/reporting/csv-upload";

/**
 * Whether this screen gets an upload card, and what it needs.
 *
 * Four conditions, and each is a line drawn somewhere else in the
 * product rather than invented here:
 *
 *   · **Only two screens have a file to upload.** Social Media takes
 *     the content export, Ads takes the campaign one. Email stays
 *     manual (the only sample is a PDF of charts) and Financials is
 *     manual for good, because payment exports carry names and card
 *     details.
 *   · **Not on a locked month.** A published month's figures do not
 *     change, so a card that could only ever refuse is not offered
 *     (Dom, 9 October).
 *   · **Only somebody who can edit**, which is the line every entry
 *     screen already draws.
 *   · **Not a Chiarezza login.** Nina reversed decision 36 on
 *     28 October — a member uploads their own Meta exports, under the
 *     same rules as a retainer client, because they are already their
 *     own editor everywhere else and typing twelve figures off a
 *     spreadsheet is the thing the card exists to prevent.
 *
 *     Chiarezza is still out, and deliberately: she reversed it for
 *     members and said nothing about a one-off attendee, and the
 *     original reason — every "my CSV didn't work" lands on Nina —
 *     weighs most on the people with the shortest relationship. One
 *     line to change if she wants them in.
 */

const PLATFORM: Record<string, UploadPlatform> = {
  social_media: "meta_content",
  ads: "meta_ads",
};

export async function uploadFor({
  category,
  locked,
  canEdit,
  kind,
  workspaceId,
  monthLabel,
}: {
  category: string;
  locked: boolean;
  canEdit: boolean;
  kind: "retainer" | "aos_member" | "chiarezza";
  workspaceId: string;
  monthLabel: string;
}): Promise<{
  platform: UploadPlatform;
  monthLabel: string;
  columnMaps: Record<string, "leads" | "purchases" | "ignored">;
} | null> {
  const platform = PLATFORM[category];
  if (!platform) return null;
  if (locked || !canEdit || kind === "chiarezza") return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("report_column_maps")
    .select("column_name, maps_to")
    .eq("workspace_id", workspaceId)
    .eq("platform", platform)
    .returns<{ column_name: string; maps_to: "leads" | "purchases" | "ignored" }[]>();

  return {
    platform,
    monthLabel,
    columnMaps: Object.fromEntries(
      (data ?? []).map((row) => [row.column_name.toLowerCase(), row.maps_to]),
    ),
  };
}
