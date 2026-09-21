-- 010_org_not_null.sql — MT-2: the tenant key becomes mandatory (step 3 of 3)
--
-- Target: omwqwwflvnunuvgidvwx. Requires 007, 008, 009.
-- Plan: MULTI-TENANT-PLAN.md §2.3, §6.1, phase MT-2.
--
-- ⚠️ RLS IN 007-013 IS INERT — see 007's header.
--
-- This is the migration that makes "every row belongs to exactly one tenant" a
-- structural fact rather than a convention. It is safe only because 009 ran:
-- `set not null` scans the whole table and fails if it finds one null.
--
-- It is safe against the LIVE DEPLOYMENT only because 008 left a column
-- default in place. Production is still serving older code that knows nothing
-- about org_id (see 008's header) — without the default, this statement would
-- turn the public tryout-signup form into a 500 the instant it landed. Read
-- 008 and 010 together; separating them is how that gets missed.
--
-- Idempotent: `set not null` on a column that is already not null is a no-op.

alter table public.teams          alter column org_id set not null;
alter table public.games          alter column org_id set not null;
alter table public.play_events    alter column org_id set not null;
alter table public.players        alter column org_id set not null;
alter table public.player_aliases alter column org_id set not null;
alter table public.lineup_plans   alter column org_id set not null;
alter table public.tryout_signups alter column org_id set not null;

-- ---------------------------------------------------------------------------
-- Verification — MULTI-TENANT-PLAN §6.3 Block B. Run the block quoted at the
-- foot of 009 now. Every `where org_id is null` count must be 0, and the two
-- organizations/org_members counts must be 1 and 0.
--
-- Also confirm the constraint actually took, rather than trusting the exit
-- code:
--
--   select table_name, is_nullable from information_schema.columns
--    where table_schema='public' and column_name='org_id' order by table_name;
--   -- expect is_nullable='NO' on all seven
-- ---------------------------------------------------------------------------
