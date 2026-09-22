\set ON_ERROR_STOP on
-- Disposable review fixture only, mirroring tests/training-database.sql. Apply
-- after review-fixture.sql, both live migrations, the training migration
-- (20260921195625_live_training_and_event_context.sql), and
-- 20260922150000_position_practice_bundles.sql. All rows below roll back
-- when verification completes.
--
-- NOT EXECUTED against a live database as part of this change (no local
-- Postgres/Supabase instance was available in the worktree). Written to the
-- same conventions as training-database.sql so it can be run against a
-- review database the same way that file is.
begin;
set local role service_role;
insert into public.training_practice_bundles(org_id,id,player_id,bundle_id)
values ('org-outlaws','database-review-bundle','review-1','pos-2b');
insert into public.training_assignments(org_id,id,player_id,scenario_id,bundle_assignment_id,bundle_position)
values
  ('org-outlaws','database-review-bundle-b5','review-1','b5','database-review-bundle',0),
  ('org-outlaws','database-review-bundle-b6','review-1','b6','database-review-bundle',1);
insert into public.training_attempts(org_id,assignment_id,id,answer,correct)
values
  ('org-outlaws','database-review-bundle-b5','wrong','P',false),
  ('org-outlaws','database-review-bundle-b5','right','2B',true),
  ('org-outlaws','database-review-bundle-b6','right','SS',true);
do $$
begin
  assert (select scenario_count=2 and scenarios_completed=2
            and total_attempts=3 and total_correct=2
          from public.training_bundle_progress
          where org_id='org-outlaws' and id='database-review-bundle'),
    'bundle progress rolls up member scenario attempts/correct';
  assert (select attempts=2 and correct=1 and bundle_assignment_id='database-review-bundle'
            and bundle_position=0
          from public.training_progress
          where org_id='org-outlaws' and id='database-review-bundle-b5'),
    'per-scenario progress still reports individually, with bundle linkage attached';
  -- Legacy single-scenario rows (no bundle) keep working unchanged.
  insert into public.training_assignments(org_id,id,player_id,scenario_id)
  values ('org-outlaws','database-review-legacy','review-1','b1');
  assert (select bundle_assignment_id is null and bundle_position is null
          from public.training_progress
          where org_id='org-outlaws' and id='database-review-legacy'),
    'legacy scenario-only assignments remain unbundled';
  begin
    insert into public.training_practice_bundles(org_id,id,player_id,bundle_id)
    values ('org-outlaws','foreign-bundle','talking-1','pos-2b');
    raise exception 'cross-tenant bundle accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.training_assignments(org_id,id,player_id,scenario_id,bundle_assignment_id,bundle_position)
    values ('org-outlaws','cross-tenant-member','review-1','b1','nonexistent-bundle',0);
    raise exception 'assignment linked to a nonexistent bundle accepted';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;
do $$
begin
  assert not has_table_privilege('anon','public.training_bundle_progress','SELECT'), 'anonymous bundle progress denied';
  assert not has_table_privilege('authenticated','public.training_practice_bundles','SELECT'), 'direct bundle read denied';
  assert not has_table_privilege('authenticated','public.training_practice_bundles','INSERT'), 'direct bundle write denied';
  assert (select relrowsecurity from pg_class
    where oid='public.training_practice_bundles'::regclass), 'bundle RLS enabled';
  assert (select 'security_invoker=true'=any(reloptions) from pg_class
    where oid='public.training_bundle_progress'::regclass), 'bundle progress view uses caller permissions';
  assert (select 'security_invoker=true'=any(reloptions) from pg_class
    where oid='public.training_progress'::regclass), 'training_progress view still uses caller permissions after the additive column append';
end $$;
rollback;
select 'position practice bundle database assertions passed' as result;
