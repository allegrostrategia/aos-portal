-- ---------------------------------------------------------------------------
-- message_reactions into the Realtime publication
--
-- The Sociale screen (13 Sep) listens for reactions on the same Realtime
-- channel as messages, and the note said to add the table to the publication
-- in the dashboard. That step never landed. Realtime rejects a channel with
-- any binding it cannot serve, so from 13 Sep to now every open conversation
-- got NO live updates at all: not reactions, and not messages either. Nothing
-- said so, because the rejection arrives as a "system" message after the
-- client has already reported SUBSCRIBED.
--
-- So: a migration, guarded the same way chat_messages was, and never a
-- dashboard step again. `npm run test:db` creates the publication so this
-- block runs there too, and the schema test asserts both tables are in it.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'message_reactions'
     ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end
$$;
