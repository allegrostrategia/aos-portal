-- aOS — the roadmap reveal document (Step 12, Build Brief §1).
--
-- **Not member-facing, and that isn't an oversight.** §1: the document is handed
-- over at the end of the 1:1 "before they even log into the portal". It's a
-- point-in-time artifact that never needs updating — the living version of all
-- this is La Strada, which they get access to afterwards.
--
-- §1 also described it as generated per member from the quiz and call answers by
-- Claude, with Nina confirming. That is no longer the plan: as of 3 Sep no AI
-- runs inside the product. She writes it — with Claude, outside — and what the
-- app does is hold the words and render them in the brand's own document, so
-- every member's reveal looks like the first page of aOS rather than like
-- whatever HTML survived being edited by hand.
--
-- A snapshot, deliberately: the priorities here are what was said at the 1:1,
-- and they stay that even after the roadmap moves on. Reading them live from
-- `roadmap` would quietly rewrite history every time Nina re-points somebody.

create table public.roadmap_reveals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,

  -- Hero meta, as free text: Nina has the call notes and these are phrases
  -- rather than data — "around 14 hrs/week on admin" is a better baseline than
  -- a number the product would have to defend.
  prepared_on date not null default current_date,
  baseline text,
  starts_on text,

  -- The honest picture (§1's diagnosis structure).
  in_their_words text,
  whats_working text,
  whats_not_working text,

  -- [{ "title": ..., "body": ... }] — three at the 1:1, but not fixed at three
  -- in the schema. A member with two real priorities shouldn't get a padded one.
  priorities jsonb not null default '[]'::jsonb,

  -- Where La Strada starts for them, and why.
  road_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One per member. A second reveal would be a different document for the same
  -- moment; a recommit gets its own conversation, not a rewritten first one.
  unique (member_id)
);

create trigger roadmap_reveals_set_updated_at
  before update on public.roadmap_reveals
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Admin only, in both directions. The member never reads this through the
-- portal because they were handed it before they had one — and by the time they
-- log in, La Strada is the live version of the same thing.
--
-- No member policy at all rather than a restrictive one: there is no case where
-- a member should read this table, and a policy implies there might be.
-- ---------------------------------------------------------------------------

alter table public.roadmap_reveals enable row level security;

create policy roadmap_reveals_all_admin
  on public.roadmap_reveals for all
  to authenticated
  using (public.is_portal_admin())
  with check (public.is_portal_admin());
