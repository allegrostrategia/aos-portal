-- aOS — the hot seat prep flow, round 3 (§B).
--
-- Three additions, none of them replacing anything:
--
--   1. A reflection on the submission, beside the three questions that stay
--      exactly as they are: what the member's own log says has been eating
--      their month, and what they would like to streamline. "Not sure yet"
--      is an honest answer and gets its own flag rather than a magic string.
--
--   2. A comment thread on the submission. Nina's notes before the call, and
--      the member's replies: two-way, not a one-way note. Comments are a
--      record, so no update or delete for anyone; a correction is another
--      comment. Nina's note is a comment from an admin, which is what the
--      screens use to label it and what the push and the Piazza flag key off.
--
--   3. `comments_seen_at`: when the member last opened the thread. The
--      Piazza flag ("Nina's left a comment") is a comment by an admin newer
--      than that. Set by the member's own visit, so it clears itself.
--
-- The thread closes when the challenge is confirmed. After that the
-- confirmed build is the record and the thread is archived behind a toggle;
-- a member with more to say has the call itself. Nina can still comment,
-- because she may need to leave a word about what was locked.

alter table public.hot_seat_submissions
  add column reflection text,
  add column reflection_unsure boolean not null default false,
  add column comments_seen_at timestamptz;

comment on column public.hot_seat_submissions.reflection is
  'Round 3: what their own log says has been eating the month, and what they want to streamline. Free text, optional.';
comment on column public.hot_seat_submissions.reflection_unsure is
  'Round 3: the member said "not sure yet" instead of, or as well as, writing a reflection.';
comment on column public.hot_seat_submissions.comments_seen_at is
  'When the member last opened their submission''s thread. Piazza flags an admin comment newer than this.';

create table public.hot_seat_comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.hot_seat_submissions (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null check (nullif(btrim(body), '') is not null),
  created_at timestamptz not null default now()
);

create index hot_seat_comments_submission_idx
  on public.hot_seat_comments (submission_id, created_at);

alter table public.hot_seat_comments enable row level security;

-- The member reads the thread on their own submission; an admin reads all.
create policy hot_seat_comments_select_own
  on public.hot_seat_comments for select
  to authenticated
  using (
    public.has_portal_access()
    and exists (
      select 1 from public.hot_seat_submissions s
      where s.id = submission_id and s.member_id = (select auth.uid())
    )
  );

create policy hot_seat_comments_select_admin
  on public.hot_seat_comments for select
  to authenticated
  using (public.is_portal_admin());

-- A member replies on their own submission, as themselves, while it is still
-- open: the thread closes when the challenge is confirmed.
create policy hot_seat_comments_insert_own
  on public.hot_seat_comments for insert
  to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_active_member()
    and exists (
      select 1 from public.hot_seat_submissions s
      where s.id = submission_id
        and s.member_id = (select auth.uid())
        and s.confirmed_at is null
    )
  );

create policy hot_seat_comments_insert_admin
  on public.hot_seat_comments for insert
  to authenticated
  with check (member_id = (select auth.uid()) and public.is_portal_admin());

-- No update or delete, for anyone. A comment is a record of what was said
-- before the call.
