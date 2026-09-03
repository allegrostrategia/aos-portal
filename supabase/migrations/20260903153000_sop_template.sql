-- aOS — the SOP template (Step 9, Build Brief §8).
--
-- §8 originally proposed an AI generator: structured Q&A into one Claude call
-- that writes the SOP up. **That is no longer the plan.** As of 3 Sep no AI runs
-- inside the product at all, so this is what it becomes — a template the member
-- fills in themselves, whenever they've built something worth writing down.
--
-- Which turns out to lose less than it sounds. The structure was always the
-- useful part: a member who has answered "what triggers this, what are the
-- steps, who does it, what tools" has written the SOP. The generator would have
-- rephrased it.
--
-- Structured content in jsonb rather than columns, because steps are an ordered
-- list of unknown length and a `sop_steps` table would mean joins and ordering
-- columns for something that is only ever read and written whole.
--
--   { "trigger": "...", "outcome": "...", "owner": "...",
--     "tools": ["..."], "video_url": "...",
--     "steps": [{ "text": "..." }] }
--
-- `body` stays what it is: the prose write-up Nina types for a hot seat build.
-- A build gets written about; an SOP gets filled in. Two shapes, two fields,
-- rather than one field meaning different things depending on `source`.

alter table public.handover_pack
  add column sop jsonb;

-- Only SOPs carry one. A hot seat write-up with structured steps would mean the
-- source no longer says what a row is.
alter table public.handover_pack
  add constraint handover_pack_sop_is_member_sop
  check (sop is null or source = 'member_sop');

-- §11: SOPs are the only exportable content in the product, and a member writing
-- their own owns it outright — no confirmation step, nothing for Nina to
-- approve. That's the difference between their SOP and her write-up of a build.
comment on column public.handover_pack.sop is
  'Member-authored SOP template content. Null for hot seat write-ups (§8).';
