-- =============================================================================
-- A reply from the client is from the client.
-- =============================================================================
--
-- Dom asked, reviewing the published-month lock on 7 October: the guard lets
-- any `client_reply` through on a published month — does the insert policy
-- guarantee only the client can write one?
--
-- It does not. `report_notes_write` asks `report_can_view(workspace_id)` for a
-- client_reply, and that is true for an assigned team member. `author_id` is
-- pinned to the writer, so Elize cannot claim the client's user id — but
-- `author_name` is free text and **it is what the screen prints**
-- (`replies.tsx` renders `reply.author_name`; `author_id` only decides who
-- gets the "Reword this" link). So:
--
--     insert into report_notes (…, note_type, author_id,  author_name,   body)
--     values (…, 'client_reply', <elize>, 'Bella Rossi', 'Happy with everything!')
--
-- lands on the client's own published report, over the client's own name.
-- Proved in `published-months.test.mjs` before this migration was written.
--
-- Older than the lock — it was reachable on any month since 30 September —
-- but the lock's carve-out keeps it open on exactly the months where it does
-- the most damage: a report the client has already read, and may be asked to
-- read again.
--
-- WHY THE FIX IS HERE AND NOT IN THE GUARD
--   The guard's question is "is this row a reply". The policy's question is
--   "who may write a reply". They are different questions, and asking one of
--   them in two places is how the two answers drift apart — which is the
--   lesson written on `report_is_visible`, whose expression copied into four
--   policies came out different in four of them. So the lock migration stays
--   exactly as it was reviewed, and this corrects the thing that was actually
--   wrong.
--
-- WHAT THIS DOES NOT FIX
--   `author_name` is still free text for the person it belongs to, so a
--   client may sign their own reply with any name they like, including
--   Nina's. It is their own box in their own thread and only Nina reads it,
--   so it is a smaller thing by a long way — but it is the same shape, and
--   closing it means pinning the name to the grant's `display_name` in a
--   trigger. Flagged for Dom rather than decided here.
--
--   An admin still passes, as everywhere: `report_notes_all_admin` is a
--   `for all` policy and is not touched.

-- `alter policy`, not drop-and-create: Postgres has no `create or replace`
-- for a policy, and dropping one leaves the table briefly open to the whole
-- `authenticated` role in a migration that is meant to narrow it.
alter policy report_notes_write
  on public.report_notes
  with check (
    author_id = (select auth.uid())
    and public.report_can_read_month(workspace_id, month)
    and case note_type
      -- §2: a retainer client's whole write access is this one row type —
      -- and it is theirs. A team member has no business authoring one, in
      -- their own name or anybody else's: their half of the conversation is
      -- the strategist's note above it, which is what §8 says and what
      -- `replies.tsx` already assumes ("She has no box of her own here").
      when 'client_reply' then
        public.report_can_view(workspace_id)
        and not public.report_is_team(workspace_id)
      when 'strategist' then public.report_is_team(workspace_id)
      else public.report_can_edit(workspace_id)
    end
  );

comment on policy report_notes_write on public.report_notes is
  'Who may write which kind of note. A client_reply is the client''s alone: author_name is what the screen prints, so a team member writing one could sign it with the client''s name (Dom, 7 Oct 2026).';
