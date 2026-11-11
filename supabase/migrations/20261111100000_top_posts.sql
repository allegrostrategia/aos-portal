-- aOS Reporting — the month's top posts, per platform.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom before applying, as every
-- migration is.
--
-- Nina, 11 November: "Top performing posts matters more than the overall
-- stats, because it shows clients what style of post to make next
-- month." Three posts per platform per month, each a link the client can
-- click, with the figures that say why it is in the list.
--
-- **No captions. None.** The first proposal kept a short snippet of the
-- caption beside each link and Nina said no on 11 November: the link
-- opens the post, which has the caption in it, and §10.1's "the file
-- itself is never stored, only the numbers taken from it" stays true as
-- written. So this table holds a URL, a date, what kind of post it was,
-- and five figures — nothing a person wrote.
--
-- WHY A TABLE RATHER THAN `report_values`
--   The same reason §5.3's hooks have one: a numeric metric has nowhere
--   to put a link. `report_values.value` is `numeric`, and a post is a
--   URL with five numbers hanging off it rather than one figure.
--
-- WHY `entity_id` IS NOT NULL
--   A top post belongs to a platform — Instagram's top three and
--   LinkedIn's are different lists, and a post with no platform could
--   not be drawn on either. The platform is a `report_entities` row, as
--   every Social Media figure's already is.

create type public.report_post_type as enum (
  'reel', 'carousel', 'photo', 'video', 'story', 'other'
);

create table public.report_top_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.report_workspaces (id) on delete cascade,
  month date not null,

  -- The social platform this post was on. `restrict` for the same reason
  -- `report_values` uses it (7 Oct): retiring a platform is `active =
  -- false`, and deleting one should not take a published month's posts
  -- with it.
  entity_id uuid not null references public.report_entities (id) on delete restrict,

  rank smallint not null,

  url text not null,
  posted_on date,
  post_type public.report_post_type,

  -- The figures §5.2 already asks for at account level, here per post.
  -- Reach and views are both kept because Instagram reports one and
  -- TikTok the other, and the list is ranked on reach falling back to
  -- views (Nina, 11 November).
  reach integer,
  views integer,
  likes_plus_comments integer,
  saves integer,
  shares integer,

  -- Whether it came from the Meta export or was typed, the same
  -- distinction `report_values` draws.
  source public.report_value_source not null default 'manual',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint report_top_posts_month_is_first check (extract(day from month) = 1),
  constraint report_top_posts_rank_range check (rank between 1 and 3),
  -- **A link that is not a link is worse than no link.** The card draws
  -- an anchor from this, and `javascript:` in an href is the one string
  -- that turns a report into somewhere to run code. Refused here as well
  -- as on the screen, because the screen is not the only way in.
  constraint report_top_posts_url_is_http check (url ~* '^https?://[^\s]+$'),
  constraint report_top_posts_figures_not_negative check (
    coalesce(reach, 0) >= 0 and coalesce(views, 0) >= 0
    and coalesce(likes_plus_comments, 0) >= 0
    and coalesce(saves, 0) >= 0 and coalesce(shares, 0) >= 0
  ),

  unique (workspace_id, month, entity_id, rank)
);

create index report_top_posts_workspace_idx
  on public.report_top_posts (workspace_id, month);

create trigger report_top_posts_set_updated_at
  before update on public.report_top_posts
  for each row
  execute function public.set_updated_at();

-- The platform has to be a platform, and has to be this client's. A
-- foreign key can only say "some entity" — the same gap the funnel's
-- linked offer has, closed the same way.
create or replace function public.guard_report_top_post_platform()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.report_entity_type;
  v_workspace uuid;
begin
  select entity_type, workspace_id into v_type, v_workspace
  from public.report_entities where id = new.entity_id;

  if v_type is distinct from 'social_platform' then
    raise exception 'A top post belongs to a social platform';
  end if;

  if v_workspace is distinct from new.workspace_id then
    raise exception 'A top post can only be on this business''s own platform';
  end if;

  return new;
end;
$$;

create trigger report_top_posts_guard_platform
  before insert or update on public.report_top_posts
  for each row
  execute function public.guard_report_top_post_platform();

-- A published month does not change. The same guard every other table of
-- month content wears (7 Oct) — admin and the service role pass, as they
-- must, because the publish job writes with no JWT.
create trigger report_top_posts_guard_published
  before insert or update or delete on public.report_top_posts
  for each row
  execute function public.guard_report_published_month();

alter table public.report_top_posts enable row level security;

create policy report_top_posts_all_admin
  on public.report_top_posts for all to authenticated
  using (public.is_portal_admin()) with check (public.is_portal_admin());

-- A client reads them once the month is published, which is the rule
-- every other piece of month content follows.
create policy report_top_posts_select_readers
  on public.report_top_posts for select to authenticated
  using (public.report_can_read_month(workspace_id, month));

create policy report_top_posts_write_editors
  on public.report_top_posts for insert to authenticated
  with check (public.report_can_edit(workspace_id));

create policy report_top_posts_update_editors
  on public.report_top_posts for update to authenticated
  using (public.report_can_edit(workspace_id))
  with check (public.report_can_edit(workspace_id));

create policy report_top_posts_delete_editors
  on public.report_top_posts for delete to authenticated
  using (public.report_can_edit(workspace_id));

comment on table public.report_top_posts is
  'The three best posts of a month on one platform: a link, a date, the kind of post and its figures. No caption is stored - the link opens the post (Nina, 11 Nov 2026).';

-- -----------------------------------------------------------------------------
-- Trial Reels' "What worked this month" gets a link too.
-- -----------------------------------------------------------------------------
--
-- Nina, 11 November: the same argument as top posts. A hook written down
-- is a line of text somebody then has to go and find; a hook with a link
-- is the reel itself. Nullable, because the hooks already saved have no
-- link and a hook somebody types from memory never will.

alter table public.report_top_items
  add column url text,
  add constraint report_top_items_url_is_http
    check (url is null or url ~* '^https?://[^\s]+$');

comment on column public.report_top_items.url is
  'Where to watch it. Optional - a hook typed from memory has no link (Nina, 11 Nov 2026).';
