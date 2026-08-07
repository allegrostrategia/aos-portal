-- aOS — the handover pack (Archivio).
--
-- Build Brief §8 (Handover pack), §11 (Export rules, Archivio).
--
-- Archivio is the member's OWN projects — what they've actually built each month.
-- Distinct from Studio dell'Architetto, which is training content about systems in
-- general. Genuinely different sources, not two views of one dataset (§8).

create type public.handover_source as enum (
  'hot_seat',   -- auto-compiled from a live build, Nina drafts the write-up with AI
  'member_sop', -- the member wrote it themselves
  'ai_sop'      -- the AI SOP generator: structured Q&A → one Claude call → review
);

create table public.handover_pack (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  title text not null,
  body text,

  source public.handover_source not null,

  -- Where it came from, when it came from a live build.
  station_slug text references public.stations (slug),

  -- AI drafts, human confirms — the same pattern as everywhere else, here applied
  -- to the write-up (§8). Nina drafts with AI assistance after the call and
  -- submits it to the member's portal.
  drafted_by public.drafted_by not null default 'claude',
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,

  -- The member can edit their own copy, rephrasing it in their own words (§8).
  member_edited_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index handover_pack_member_idx
  on public.handover_pack (member_id, created_at desc);

create trigger handover_pack_set_updated_at
  before update on public.handover_pack
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- IMPORTANT — the trap flagged when the cancellation lifecycle was designed:
-- these policies gate on has_portal_access(), NOT on `status = 'active'`. A member
-- who cancelled and rejoined sits in `onboarding` while their old handover pack
-- must stay visible to them as history (§1, Rejoining). Nothing was deleted; an
-- active-only gate would hide their own past work from them anyway.
-- ---------------------------------------------------------------------------

alter table public.handover_pack enable row level security;

create policy handover_pack_select_own
  on public.handover_pack for select
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access());

-- Members add their own SOPs (§8), by hand or through the AI generator.
create policy handover_pack_insert_own
  on public.handover_pack for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and source in ('member_sop', 'ai_sop')
  );

create policy handover_pack_update_own
  on public.handover_pack for update
  to authenticated
  using (member_id = (select auth.uid()) and public.has_portal_access())
  with check (member_id = (select auth.uid()));

create policy handover_pack_delete_own_sop
  on public.handover_pack for delete
  to authenticated
  using (
    member_id = (select auth.uid())
    and public.has_portal_access()
    and source in ('member_sop', 'ai_sop')
  );

create policy handover_pack_all_admin
  on public.handover_pack for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());

-- ---------------------------------------------------------------------------
-- Export (§11)
-- ---------------------------------------------------------------------------
--
-- SOPs are the only exportable content in the product: a cleanly styled Word doc,
-- generated on demand. Not a live file in the member's Google Drive — that was
-- considered and rejected, and skipping it avoids an OAuth integration entirely.
--
-- Hot-seat-sourced entries are the member's own work too, so they export on the
-- same terms. The rule that stays closed is formal TRAINING content, which lives
-- in a different table and never exports at all.
