\set ON_ERROR_STOP on
-- Disposable review fixture only. Apply after review-fixture.sql and both
-- live migrations. All rows below roll back when verification completes.
begin;
set local role service_role;
insert into public.training_assignments(org_id,id,player_id,scenario_id)
values ('org-outlaws','database-review-assignment','review-1','b1');
insert into public.training_attempts(org_id,assignment_id,id,answer,correct)
values ('org-outlaws','database-review-assignment','wrong','P',false),
       ('org-outlaws','database-review-assignment','right','CF',true);
do $$
begin
  assert (select attempts=2 and correct=1 from public.training_progress
    where org_id='org-outlaws' and id='database-review-assignment'), 'complete progress counts';
  begin
    insert into public.training_assignments(org_id,id,player_id,scenario_id)
    values ('org-outlaws','foreign-player','talking-1','b1');
    raise exception 'cross-tenant player accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.training_attempts(org_id,assignment_id,id,answer,correct)
    values ('org-review-talking','database-review-assignment','foreign-attempt','CF',true);
    raise exception 'cross-tenant attempt accepted';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;
do $$
begin
  assert not has_table_privilege('anon','public.training_progress','SELECT'), 'anonymous progress denied';
  assert not has_table_privilege('authenticated','public.training_attempts','INSERT'), 'direct attempt write denied';
  assert not has_table_privilege('authenticated','public.training_assignments','SELECT'), 'direct assignment read denied';
  assert (select bool_and(relrowsecurity) from pg_class where oid in
    ('public.training_assignments'::regclass,'public.training_attempts'::regclass)), 'training RLS enabled';
  assert (select 'security_invoker=true'=any(reloptions) from pg_class
    where oid='public.training_progress'::regclass), 'progress view uses caller permissions';
  assert not has_function_privilege('anon','public.commit_live_game_command(text,text,text,integer,jsonb,jsonb,text,text)','EXECUTE'), 'replacement RPC retains restricted grants';
end $$;
rollback;
select 'training database assertions passed' as result;
