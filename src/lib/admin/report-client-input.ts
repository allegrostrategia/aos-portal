/**
 * What a new reporting client needs, checked before anything is created.
 *
 * Its own pure module because `report-users.ts` is a "use server" file, where
 * every export has to be an async action — and because this is the part worth
 * having tests for. The invite flow creates an auth user and a workspace
 * together; getting the validation wrong either blocks a real client or
 * leaves half of one behind.
 */

export type WorkspaceKind = "retainer" | "aos_member" | "chiarezza";

export const KINDS: WorkspaceKind[] = ["retainer", "aos_member", "chiarezza"];

export interface ReportClientInput {
  email: string;
  displayName: string;
  businessName: string;
  kind: string;
  firstMonth: string;
  accessEnd: string;
  currency?: string;
}

export interface ReportClientPlan {
  email: string;
  displayName: string;
  businessName: string;
  kind: WorkspaceKind;
  firstMonth: string;
  /** Null for everyone but a Chiarezza attendee. */
  accessEndDate: string | null;
  currency: string;
}

/** `YYYY-MM` or `YYYY-MM-DD` to the first of that month; null if unusable. */
function firstOfMonth(value: string): string | null {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

export function validateReportClient(
  input: ReportClientInput,
): { error: string } | { plan: ReportClientPlan } {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const businessName = input.businessName.trim();

  if (!email || !displayName || !businessName) {
    return { error: "An email address, a contact name and a business name are all needed." };
  }

  const kind = input.kind as WorkspaceKind;
  if (!KINDS.includes(kind)) {
    return { error: "Pick whether this is a retainer client or a Chiarezza attendee." };
  }

  if (kind === "aos_member") {
    return {
      error:
        "An aOS member already has a login. Add reporting to their member record instead, so their workspace attaches to the account they have.",
    };
  }

  const firstMonth = firstOfMonth(input.firstMonth);
  if (!firstMonth) {
    return { error: "Give the first month this client has data for, as YYYY-MM." };
  }

  // Only a Chiarezza attendee's access expires — the database says so too,
  // with a check constraint.
  //
  // A date supplied for anyone else is IGNORED rather than refused. The form
  // does not show the field unless Chiarezza is chosen, so a value arriving
  // here for a retainer is a browser filling something in, or a leftover from
  // a kind the person changed their mind about — and refusing it strands them
  // on a screen with no field to clear. Dom hit exactly that on 30 September.
  const accessEndDate = kind === "chiarezza" ? firstOfMonth(input.accessEnd) : null;

  if (kind === "chiarezza" && !accessEndDate) {
    return { error: "A Chiarezza attendee needs the month their access ends." };
  }

  if (accessEndDate && accessEndDate < firstMonth) {
    return { error: "Access cannot end before the first month with figures." };
  }

  return {
    plan: {
      email,
      displayName,
      businessName,
      kind,
      firstMonth,
      accessEndDate,
      currency: (input.currency ?? "GBP").trim() || "GBP",
    },
  };
}
