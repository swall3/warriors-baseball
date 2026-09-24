-- ============================================================================
-- Migration history repair — PHASE 1b: READ-ONLY PROBES
-- InningWise prod (project omwqwwflvnunuvgidvwx) — 2026-09-24
--
-- The Phase-1 preflight (run via ChatGPT) established the recorded history has
-- only 8 rows, while supabase/migrations/ has 17 timestamped files (+ 15
-- legacy 001..015 files). "Unrecorded" does NOT mean "unapplied": we must
-- probe live status for the 6 timestamped migrations whose live state is
-- still unknown, confirm practice_plans' shape (needed to record it), and
-- compare the 3 RE-TIMESTAMPED history rows' recorded statements against the
-- local files (a matching name does not prove matching content).
--
-- NOTHING HERE MODIFIES DATA. Run every query, capture output, return it.
-- Run this BEFORE Phase 2 is trusted to record the six; Phase 2 itself is
-- independently guarded and does not depend on this file.
-- ============================================================================

-- 1. Live status of the 6 unrecorded-but-maybe-applied timestamped migrations.
--    One signature object per file. NULL/false => NOT applied => a prod break
--    (code on master depends on these) => report, do not fold into Phase 2.
select
  to_regclass('public.live_game_commands')          as live_game_commands,        -- 20260921192619
  to_regclass('public.training_attempts')           as training_attempts,         -- 20260921195625
  to_regprocedure('public.sync_historical_game(text,jsonb,jsonb)')
                                                     as sync_historical_game,      -- 20260922041841
  to_regclass('public.training_practice_bundles')   as training_practice_bundles, -- 20260922150000
  to_regclass('public.org_billing')                 as org_billing,               -- 20260922160000
  to_regprocedure('public.notify_org_billing_change()')
                                                     as notify_org_billing_change; -- 20260922170000

-- 2. practice_plans shape (needed to safely record 20260922180001).
--    2a. columns
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='practice_plans'
order by ordinal_position;
--    2b. constraints (expect PK (org_id,id) + FK (org_id,team_id)->teams)
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid='public.practice_plans'::regclass
order by contype, conname;
--    2c. org_id present (the ONE custom_practice_drills precondition ChatGPT's
--    "required keys present" did NOT explicitly cover — expect one row).
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='practice_plans'
  and column_name='org_id';

-- 3. The 3 RE-TIMESTAMPED rows: local files use different version strings than
--    the recorded rows (name matches, timestamp does not). Compare the RECORDED
--    statements against the local DDL to prove content parity, not just name.
--      local 20260922114805_team_billing            -> recorded 20260922120148
--      local 20260922132556_email_notifications      -> recorded 20260922133551
--      local 20260922135427_organization_team_access -> recorded 20260922142727
select version, name, statements
from supabase_migrations.schema_migrations
where version in ('20260922120148','20260922133551','20260922142727')
order by version;

-- ============================================================================
-- END PHASE 1b. Return all output before running Phase 2's history inserts.
-- ============================================================================
