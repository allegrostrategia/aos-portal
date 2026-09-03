/**
 * Hand-written types for the tables the app touches.
 *
 * These would normally come from `supabase gen types typescript`, but both routes
 * to that need Docker, which isn't installed here. Kept deliberately small: add a
 * type when a feature needs it, rather than mirroring the whole schema by hand and
 * letting it drift. `npm run test:db` is what actually guards the schema.
 */

export type MemberStatus = "onboarding" | "active" | "cancelled";
export type MemberRole = "member" | "admin";

/** V/L/S/P. Secondary tags for the recommendation engine, never the navigation. */
export type Bucket = "visibility" | "launch" | "systems_delivery" | "profit";

export type AuditOccasion = "onboarding" | "recommit";

export interface MemberProfile {
  member_id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  headshot_path: string | null;
  links: { label: string; url: string }[];
  completed_at: string | null;
}

export interface Member {
  id: string;
  email: string;
  full_name: string;
  role: MemberRole;
  status: MemberStatus;
  /** §9: the odd one out in a month's pairing is paired with the coach. */
  is_coach: boolean;
  join_date: string;
  onboarding_start_date: string | null;
  cohort_start_date: string | null;
  welcome_session_watched_at: string | null;
  payment_confirmed_at: string | null;
  contract_signed_at: string | null;
  contract_term_months: number;
  contract_term_end_date: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
