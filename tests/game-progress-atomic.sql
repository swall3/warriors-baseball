-- Run only in the disposable local review database after the progress
-- migrations. Fixture changes are rolled back.
\set ON_ERROR_STOP on
begin;
delete from public.game_progress
where org_id = 'org-outlaws' and player_id = 'review-2'
  and game_key = 'stabilization-test';

do $$
declare
  first_id uuid := '11111111-1111-4111-8111-111111111111';
  second_id uuid := '22222222-2222-4222-8222-222222222222';
  result public.game_progress%rowtype;
begin
  if not public.record_game_progress('org-outlaws','review-2','stabilization-test',first_id,true) then
    raise exception 'First answer was not recorded';
  end if;
  if public.record_game_progress('org-outlaws','review-2','stabilization-test',first_id,true) then
    raise exception 'Duplicate answer was recorded';
  end if;
  if not public.record_game_progress('org-outlaws','review-2','stabilization-test',second_id,false) then
    raise exception 'Second answer was not recorded';
  end if;
  select * into result from public.game_progress
  where org_id='org-outlaws' and player_id='review-2' and game_key='stabilization-test';
  if result.correct <> 1 or result.total <> 2 or cardinality(result.recent_attempts) <> 2 then
    raise exception 'Aggregate is incorrect: % correct, % total', result.correct, result.total;
  end if;
  if has_function_privilege('authenticated',
    'public.record_game_progress(text,text,text,uuid,boolean,integer,integer)', 'EXECUTE') then
    raise exception 'Browser role can record progress directly';
  end if;
end;
$$;
rollback;
