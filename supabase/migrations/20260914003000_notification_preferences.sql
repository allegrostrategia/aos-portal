-- aOS — which emails a member wants.
--
-- L'Editoriale redesign brief, §10: "Notifications — new, a settings area for
-- turning notifications on/off." Three switches, matching the three kinds of
-- email the product sends: reminders (the weekly log and the hot seat), chat
-- (the unread digest), and pairing (the match email). Build check-ins are
-- reminders about the member's own build and follow the first switch; the
-- day-7 nudge goes to Nina, not the member.
-- Not one per email: nobody wants to configure "the 2-day hot seat reminder"
-- separately from "the 7-day one", and a switch per template is a switch
-- nobody understands.
--
-- On `members`, because they are facts about the member and nothing else
-- needs to join to them. The guard trigger on members is a blocklist of the
-- columns a member may not change; these are not on it, so they are the
-- member's to set by construction.
--
-- Default on. Turning a thing off is a choice; silence by default is not.

alter table public.members
  add column notify_reminders boolean not null default true,
  add column notify_chat boolean not null default true,
  add column notify_pairing boolean not null default true;

comment on column public.members.notify_reminders is 'Weekly log, hot seat, and build check-in reminder emails.';
comment on column public.members.notify_chat is 'The unread chat digest email.';
comment on column public.members.notify_pairing is 'Pairing match emails. The day-7 nudge goes to Nina, not the member, and is not switchable here.';
