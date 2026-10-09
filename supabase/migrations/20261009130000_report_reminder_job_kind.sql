-- =============================================================================
-- The two report reminders are a job kind. NOT APPLIED TO LIVE.
-- =============================================================================
--
-- §8.1: a member gets two nudges about last month's report and no more —
-- one on the 1st, one on the 8th if it is still not done. They go through
-- `due_jobs` like every other reminder in this product, so they inherit
-- the catch-up behaviour (`lte`, not `eq`, so a missed morning is caught
-- up rather than lost) and the send-time recheck.
--
-- **Held back from live deliberately, although it is additive.** Dom's
-- pre-approved list is delete policies bounded by the lock, admin arms,
-- service-role arms and unique indexes. This is none of those, and an
-- enum value is the one kind of additive change Postgres will not let
-- you take back: there is no `alter type … drop value`. Undoing it means
-- rebuilding the type and every column that uses it. Cheap to wait for a
-- yes; expensive to be wrong.

alter type public.due_job_kind add value if not exists 'report_reminder_1';
alter type public.due_job_kind add value if not exists 'report_reminder_2';
