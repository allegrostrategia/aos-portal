-- aOS Reporting Stage 3 — the benchmark setup answers.
--
-- NOT APPLIED TO LIVE. Applied locally only; approved in the Stage 3
-- plan and waiting on Dom to apply it to live alongside
-- 20261006100000_opening_clients_wording.
--
-- §7 captures three answers at first-time setup and builds the
-- copy-and-paste prompt from them. The three columns already exist on
-- report_workspaces (benchmark_business_description,
-- benchmark_main_offers, benchmark_country), so the prompt itself needs
-- no schema at all.
--
-- What is missing is a record of the REPLY: which benchmarks came back,
-- when, and which lines could not be read. Without it, a client who
-- pastes a reply and gets four of thirteen fields filled has no way to
-- know which nine were missed, and Nina has no way to see that a
-- client's benchmarks are three months stale.

alter table public.report_workspaces
  add column benchmarks_set_at timestamptz,
  add column benchmarks_unmatched text[] not null default '{}';

comment on column public.report_workspaces.benchmarks_set_at is
  'When the benchmark reply was last pasted in. Null means the client is still being compared against last month only.';
comment on column public.report_workspaces.benchmarks_unmatched is
  'Lines of the pasted reply that matched no benchmark, kept so the client can be told which ones to fill by hand.';
