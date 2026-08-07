-- aOS — the member directory.
--
-- Build Brief §10 (Member directory), §11 (Piazza Sociale).
--
-- A separate table from `members` for one reason that matters: this is the only
-- member data other members can read. `members` is private to its owner and admin;
-- the directory listing is deliberately public within the membership. Keeping them
-- apart means the visibility rule is structural rather than a policy someone has
-- to get exactly right on a table full of private fields.

create table public.member_profiles (
  member_id uuid primary key references public.members (id) on delete cascade,

  -- Carried here rather than read from members.full_name, because members' rows
  -- aren't readable by other members — and because §10 is explicit that the
  -- listing is built from its own dedicated prompt, not auto-pulled from
  -- onboarding answers. What they'd like the directory to say, in their words:
  --
  --   "What would you like your Member Directory info to say about you? Please
  --    provide a short bio and description of the key ways to work with you with
  --    links — along with a photo of you."
  display_name text not null,
  title text,
  bio text,
  headshot_path text,

  -- Links to their offers. Shape: [{ "label": ..., "url": ... }].
  links jsonb not null default '[]'::jsonb,

  -- Filling this in is a REQUIRED onboarding task, not optional-whenever (§10).
  -- The onboarding checklist reads this.
  completed_at timestamptz,

  -- Free-text search across name, title and bio only. No category or dropdown
  -- filters, deliberately: that would mean surfacing the business-model data from
  -- the audit, which §10 keeps out of the directory entirely — it stays used only
  -- by the recommendation engine, and is kept out of pairing too (§9).
  search_vector tsvector generated always as (
    to_tsvector(
      'english'::regconfig,
      coalesce(display_name, '') || ' ' || coalesce(title, '') || ' ' || coalesce(bio, '')
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_profiles_search_idx
  on public.member_profiles using gin (search_vector);

create trigger member_profiles_set_updated_at
  before update on public.member_profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.member_profiles enable row level security;

-- The directory itself: any member with portal access reads every completed
-- listing. This is the one deliberate exception to "own rows only" — a directory
-- nobody can read isn't a directory. Incomplete listings stay hidden, so a
-- half-filled profile doesn't appear as an empty card.
create policy member_profiles_select_directory
  on public.member_profiles for select
  to authenticated
  using (public.has_portal_access() and completed_at is not null);

-- Always readable by its owner, complete or not, so they can edit it.
create policy member_profiles_select_own
  on public.member_profiles for select
  to authenticated
  using (member_id = (select auth.uid()));

create policy member_profiles_insert_own
  on public.member_profiles for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.has_portal_access());

create policy member_profiles_update_own
  on public.member_profiles for update
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (member_id = (select auth.uid()));

create policy member_profiles_all_admin
  on public.member_profiles for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- A cancelled member disappears from the directory
-- ---------------------------------------------------------------------------
--
-- Falls out of has_portal_access() on the READER's side, but not the subject's:
-- the policy above gates on whether the person looking still has access, not on
-- whether the person listed does. Filter the listing query by the subject's status
-- as well, or a cancelled member stays in the directory indefinitely. Their row
-- stays — nothing is deleted (standing rule 6) — it just shouldn't be shown.
--
-- Left to the query rather than the policy on purpose: a join to `members` inside
-- an RLS policy on a table other members can read is exactly the kind of thing
-- that quietly leaks the joined row's other columns.
