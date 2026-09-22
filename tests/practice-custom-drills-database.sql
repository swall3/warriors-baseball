\set ON_ERROR_STOP on
-- Disposable review fixture. Apply after review-fixture.sql, live-game schema,
-- practice plans, and 20260922193000_custom_practice_drills.sql.
begin;
set local role service_role;

insert into public.custom_practice_drills(
  org_id,id,team_id,name,category,positions,age_bands,duration_minutes,
  players,space,equipment,setup,instructions,scenario_category
) values (
  'org-review-talking','custom-review-drill','team-review-talking',
  'Review relay drill','team-defense',array['SS','2B'],array['9U'],12,
  '6-10 players','Half field',array['cones'],
  'Place cones at the cutoff lane.','["Field the ball","Hit the cutoff"]',
  'relay'
);

insert into public.live_games(org_id,id,team_id,state)
values ('org-review-talking','custom-review-game','team-review-talking','{}');

insert into public.practice_plans(
  org_id,id,team_id,name,blocks,source_game_id,recommendation_context
) values (
  'org-review-talking','custom-review-plan','team-review-talking',
  'Suggested review practice',
  '[{"id":"station-1","label":"Relay work","durationMinutes":12,"drillIds":["custom-review-drill"]}]',
  'custom-review-game','{"reason":"one recorded relay error"}'
);

delete from public.live_games
where org_id='org-review-talking' and id='custom-review-game';

do $$
begin
  assert exists (
    select 1 from public.custom_practice_drills
    where org_id='org-review-talking' and id='custom-review-drill'
      and team_id='team-review-talking' and archived_at is null
  ), 'custom drill persists with team scope';
  assert exists (
    select 1 from public.practice_plans
    where org_id='org-review-talking' and id='custom-review-plan'
      and source_game_id is null
      and recommendation_context->>'reason'='one recorded relay error'
  ), 'deleting the source game clears only source_game_id and preserves plan provenance';
  begin
    insert into public.custom_practice_drills(
      org_id,id,team_id,name,category,age_bands,duration_minutes,
      players,space,equipment,setup,instructions
    ) values (
      'org-review-talking','cross-org-team','team-review-warriors','Wrong team',
      'infield',array['9U'],10,'4 players','Infield',array['cones'],
      'Set up','["Go"]'
    );
    raise exception 'cross-organization team reference accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

reset role;
do $$
begin
  assert (select relrowsecurity from pg_class
    where oid='public.custom_practice_drills'::regclass), 'custom drill RLS enabled';
  assert not has_table_privilege('anon','public.custom_practice_drills','SELECT'),
    'anonymous custom drill reads denied';
  assert not has_table_privilege('authenticated','public.custom_practice_drills','SELECT'),
    'authenticated direct custom drill reads denied';
  assert has_table_privilege('service_role','public.custom_practice_drills','SELECT'),
    'server custom drill reads allowed';
end $$;

rollback;
select 'custom practice drill database assertions passed' as result;
