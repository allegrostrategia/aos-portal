import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORIES } from "@/lib/reporting/categories";
import { monthIsFinished } from "@/lib/reporting/completion-input";
import { latestReportableMonth } from "@/lib/reporting/months";

/**
 * §8.1's admin view: where each member is with last month.
 *
 * Nina sees who has finished and who has not, and what they have turned
 * off, so she can raise it with them. **Read-only** — she still enters
 * nothing for a member, which is the whole shape of self-serve.
 *
 * It asks `monthIsFinished`, the same function the member's own
 * Overview and the reminder job use. Three implementations of "done"
 * would eventually disagree, and the one that disagreed would be this:
 * a list telling Nina to chase somebody whose report reads as finished.
 *
 * **Cost, said out loud**: one call per member, each a handful of reads.
 * Fine for the handful there will be for a while, and the thing to
 * batch first when it is not — the figures for every member in a month
 * are one query if it ever needs to be.
 */
export interface MemberReportStatus {
  workspaceId: string;
  month: string;
  done: boolean;
  /** The sections they have turned off, by label, in tab order. */
  hiddenLabels: string[];
}

export async function getMemberReportStatuses(
  workspaces: { id: string; kind: string; hidden_categories: string[] }[],
  today = new Date().toISOString().slice(0, 10),
): Promise<Map<string, MemberReportStatus>> {
  const members = workspaces.filter((w) => w.kind === "aos_member");
  if (members.length === 0) return new Map();

  const month = latestReportableMonth(today);
  const admin = createAdminClient();
  const labelOf = new Map(CATEGORIES.map((c) => [c.key as string, c.label]));

  const statuses = await Promise.all(
    members.map(async (workspace) => ({
      workspaceId: workspace.id,
      month,
      done: await monthIsFinished(admin, workspace.id, month),
      hiddenLabels: CATEGORIES.filter((c) => workspace.hidden_categories.includes(c.key))
        .map((c) => labelOf.get(c.key) ?? c.key),
    })),
  );

  return new Map(statuses.map((s) => [s.workspaceId, s]));
}
