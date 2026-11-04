-- aOS Reporting — turning hours tracking off on Offers, per client.
--
-- NOT YET APPLIED TO LIVE. Shown to Dom before applying.
--
-- Nina, 3 November: a per-workspace switch to turn off hours tracking on
-- Offers, hiding hours and the hourly rate.
--
-- §5.9 asks every offer for hours spent delivering, and two of the
-- figures built on it — effective hourly rate, and the same two totalled
-- across all offers — are the ones that make Offers worth filling in for
-- a service business. For a client selling a product they are a box
-- nobody can answer, and a box nobody can answer is the reason a month
-- gets abandoned half-done.
--
-- **Display only, exactly like `hidden_categories`** (Dom, 9 Oct, about
-- hiding a section): switching it off hides the figures and the boxes.
-- It deletes nothing. Hours already entered stay in `report_values`,
-- every published month that showed them goes on showing them from its
-- own snapshot, and switching it back on brings the figures back with
-- their history intact. Rule 7 — nothing is ever deleted — holds here
-- as everywhere.
--
-- Default true, so every client that has one today keeps it and nothing
-- changes for anybody until somebody turns it off.

alter table public.report_workspaces
  add column track_offer_hours boolean not null default true;

comment on column public.report_workspaces.track_offer_hours is
  'Whether this client is asked for hours on their offers. False hides hours spent delivering and the effective hourly rate - per offer and in total - from the entry screen and the report. Display only: nothing is deleted and switching it back on restores the figures (Nina, 3 Nov 2026).';
