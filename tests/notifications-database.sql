begin;
insert into public.org_members(org_id,user_id,role) values('org-outlaws','11111111-1111-4111-8111-111111111111','owner') on conflict(org_id,user_id) do update set role='owner';
insert into public.org_billing(org_id,owner_user_id) values('org-outlaws','11111111-1111-4111-8111-111111111111') on conflict(org_id) do update set owner_user_id=excluded.owner_user_id;
insert into public.live_games(org_id,id,team_id,state) values('org-outlaws','email-disabled-test','team-review-warriors','{"status":"ready","config":{"teamName":"Warriors","date":"2026-09-23","opponent":"Test"}}');
do $$begin if exists(select 1 from notification_outbox where event_key='game:email-disabled-test:0')then raise exception 'default opted in';end if;end$$;
insert into notification_preferences(org_id,team_id,user_id,games,training,billing) values('org-outlaws','team-review-warriors','11111111-1111-4111-8111-111111111111',true,true,true) on conflict(org_id,team_id,user_id) do update set games=true,training=true,billing=true;
insert into public.live_games(org_id,id,team_id,state) values('org-outlaws','email-game-test','team-review-warriors','{"status":"ready","config":{"teamName":"Warriors","date":"2026-09-23","opponent":"Test"}}');
update live_games set revision=1,state=jsonb_set(state,'{config,date}','"2026-09-24"') where id='email-game-test';
update live_games set revision=2,state=jsonb_set(state,'{status}','"live"') where id='email-game-test';
update live_games set revision=3,state=jsonb_set(state,'{status}','"final"') where id='email-game-test';
update live_games set revision=4 where id='email-game-test';
select queue_team_notification('org-outlaws','team-review-warriors','game:email-game-test:0','games','game_prepared','{}');
select queue_team_notification('org-review-talking','team-review-warriors','wrong-org','games','game_prepared','{}');
do $$begin
 if (select count(*) from notification_outbox where event_key like 'game:email-game-test:%')<>3 then raise exception 'game events/duplicate count';end if;
 if exists(select 1 from notification_outbox where event_key='wrong-org') then raise exception 'cross tenant';end if;
 if has_table_privilege('anon','public.notification_outbox','select') or has_table_privilege('authenticated','public.notification_preferences','update') or has_function_privilege('anon','public.claim_notification(text,text,uuid)','execute') or has_function_privilege('anon','public.due_notification_orgs(integer)','execute') then raise exception 'public access';end if;
end$$;
-- Claims do not take leased rows, and exhausted/ambiguous sends never get retried.
update notification_outbox set next_attempt_at=now()+interval '1 day';
update notification_outbox set next_attempt_at=now() where event_key='game:email-game-test:0';
do $$declare n integer;begin
 select count(*) into n from claim_notification('org-outlaws','team-review-warriors','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');if n<>1 then raise exception 'claim';end if;
 select count(*) into n from claim_notification('org-outlaws','team-review-warriors','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');if n<>0 then raise exception 'duplicate lease';end if;
end$$;
update notification_outbox set lock_until=now()-interval '1 minute',first_attempt_at=now()-interval '24 hours' where event_key='game:email-game-test:0';
select * from claim_notification('org-outlaws','team-review-warriors','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
do $$begin if (select status from notification_outbox where event_key='game:email-game-test:0')<>'review' then raise exception 'expired retry';end if;end$$;
-- Training and billing use actual table writes, and roll back with their event.
insert into training_assignments(org_id,id,player_id,scenario_id,note)
 select 'org-outlaws','email-training-test',id,'test-scenario','Private note must not be emailed' from players where org_id='org-outlaws' and team_id='team-review-warriors' limit 1;
insert into training_assignments(org_id,id,player_id,scenario_id,note)
 select 'org-outlaws','email-training-test-2',id,'test-scenario','Another private note' from players where org_id='org-outlaws' and team_id='team-review-warriors' limit 1;
update org_billing set subscription_status='past_due' where org_id='org-outlaws';
do $$begin
 if (select count(*) from notification_outbox where event_key like 'training-batch:team-review-warriors:%' and details='{}')<>1 then raise exception 'training batch must send one notice';end if;
 if not exists(select 1 from notification_outbox where kind='billing_changed' and details->>'status'='past_due')then raise exception 'billing event';end if;
end$$;
rollback;
