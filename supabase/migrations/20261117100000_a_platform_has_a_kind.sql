-- aOS Reporting — a social platform knows what kind of thing it is (§5.2).
--
-- NOT YET APPLIED TO LIVE. Shown to Dom first, per §13.
--
-- Nina, 16 November, approving `docs/reporting/platform-metric-sets.md`:
-- "Yes to the platform kind picked from a list." Six kinds — Instagram,
-- LinkedIn, TikTok, YouTube, Facebook and Other.
--
-- Today a platform is **just a name**. "Instagram" is a row with the word
-- Instagram in it and nothing knows what that means, which is why LinkedIn
-- is asked for saves and a share rate and why its post types are reels and
-- carousels. The kind is what lets a figure belong to some platforms and
-- not others.
--
-- **Why not match on the name, since this migration does exactly that?**
-- Because a backfill and a rule are different things. A one-off guess over
-- five rows that a person can see and correct is fine; a guess made afresh
-- on every read is a client who renames Instagram to "IG — main" quietly
-- losing half their boxes, and a client with a campaign account called
-- "Instagram Ads" getting Instagram's. `looksLikeMeta` already guesses from
-- a name for the CSV card and is deliberately advisory only. From here the
-- kind is stored, and the screen asks for it.
--
-- **Nullable, not defaulted.** A default would have to apply to offers and
-- funnels too, which must have no kind at all — and "no kind yet" is a real
-- state worth seeing: the platforms card asks for one rather than quietly
-- handing out the general set. Every row on live is named plainly enough
-- that the backfill below gets all five right; checked first.

create type public.report_platform_kind as enum (
  'instagram', 'linkedin', 'tiktok', 'youtube', 'facebook', 'other'
);

alter table public.report_entities
  add column platform_kind public.report_platform_kind;

comment on column public.report_entities.platform_kind is
  'Which social platform this row is, for the figure set and post types it gets. Null means nobody has said yet; only a social_platform may carry one (Nina, 16 Nov 2026).';

-- The one-time guess, over rows that already exist. Anything it cannot
-- place is left null and the screen asks.
update public.report_entities
   set platform_kind = case
     when name ~* '(instagram|^ig\M|\Yig$|insta)' then 'instagram'
     when name ~* 'linked ?in' then 'linkedin'
     when name ~* 'tik ?tok' then 'tiktok'
     when name ~* '(youtube|you ?tube|^yt\M)' then 'youtube'
     when name ~* '(facebook|face ?book|^fb\M)' then 'facebook'
     else null
   end::public.report_platform_kind
 where entity_type = 'social_platform';

-- An offer with a platform kind is storable and silently meaningless, the
-- same trap the three constraints beside it close. Only the non-platform
-- side is enforced: a platform with no kind yet is a question for the
-- screen, not a refusal from the database.
alter table public.report_entities
  add constraint report_entities_platform_fields
    check (entity_type = 'social_platform' or platform_kind is null);
