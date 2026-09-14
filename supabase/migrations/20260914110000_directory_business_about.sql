-- aOS — the directory listing in two boxes.
--
-- Round 2 brief, C5: a listing shows a name and a link, and then two separate
-- things: "What my business is all about" and "A bit more about me". The
-- existing `bio` becomes the second; this adds the first. Both are searched.
--
-- The search vector is a generated column, so it has to be dropped and made
-- again to include the new text. The GIN index goes with it and comes back.

alter table public.member_profiles
  add column business_about text;

comment on column public.member_profiles.business_about is
  'What my business is all about. The first of the listing''s two boxes; bio is the second, "A bit more about me".';

drop index if exists public.member_profiles_search_idx;
alter table public.member_profiles drop column search_vector;

alter table public.member_profiles
  add column search_vector tsvector generated always as (
    to_tsvector(
      'english'::regconfig,
      coalesce(display_name, '') || ' ' || coalesce(title, '') || ' '
        || coalesce(business_about, '') || ' ' || coalesce(bio, '')
    )
  ) stored;

create index member_profiles_search_idx
  on public.member_profiles using gin (search_vector);
