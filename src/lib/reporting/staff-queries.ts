import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ClientHours } from "./ledger.ts";

/**
 * Her Client Profitability tab: who does the work, and whose work went
 * on which client.
 *
 * **The client's own team, not Allegro's** (§1's rule, and §5.10 says
 * it again): this is the member's staff and their rates, so the member
 * can see what a client costs them to serve. Nothing here records
 * Allegro's hours.
 *
 * The whole workspace, as with the other grids — the per-client card
 * compares months, and the rate captured on each row is what makes a
 * published month stay what it was.
 */

export interface StaffMember {
  id: string;
  name: string;
  hourlyRate: number;
  /** Retired staff keep every hour they ever worked. Rule 7. */
  active: boolean;
}

/** One person's hours on one client in one month. */
export interface StaffHours extends ClientHours {
  staffId: string;
}

export interface StaffLedger {
  staff: StaffMember[];
  hours: StaffHours[];
}

interface StaffRecord {
  id: string;
  name: string;
  hourly_rate: number | string;
  active: boolean;
}

interface HoursRecord {
  sales_row_id: string;
  staff_id: string;
  month: string;
  hours: number | string;
  rate_used: number | string;
}

const num = (v: number | string | null): number => {
  if (v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function getStaffLedger(workspaceId: string): Promise<StaffLedger> {
  const supabase = await createClient();

  const [staffRes, hoursRes] = await Promise.all([
    supabase
      .from("report_staff")
      .select("id, name, hourly_rate, active")
      .eq("workspace_id", workspaceId)
      .order("sort_order")
      .order("name")
      .returns<StaffRecord[]>(),
    // **The rate comes off the row, not off the person.** It was
    // captured when the hours were saved, so a pay rise costs the
    // months after it and not the ones already published.
    supabase
      .from("report_client_hours")
      .select("sales_row_id, staff_id, month, hours, rate_used")
      .eq("workspace_id", workspaceId)
      .order("month")
      .returns<HoursRecord[]>(),
  ]);

  return {
    staff: (staffRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      hourlyRate: num(s.hourly_rate),
      active: s.active,
    })),
    hours: (hoursRes.data ?? []).map((h) => ({
      salesRowId: h.sales_row_id,
      staffId: h.staff_id,
      month: String(h.month).slice(0, 10),
      hours: num(h.hours),
      rateUsed: num(h.rate_used),
    })),
  };
}
