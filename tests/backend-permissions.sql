-- Execute only in the disposable local review database.
\set ON_ERROR_STOP on
do $$ begin
 assert not has_function_privilege('anon','public.sync_historical_game(text,jsonb,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.sync_historical_game(text,jsonb,jsonb)','execute');
 assert has_function_privilege('service_role','public.sync_historical_game(text,jsonb,jsonb)','execute');
 assert not has_function_privilege('anon','public.commit_live_game_command(text,text,text,integer,jsonb,jsonb,text,text)','execute');
 assert not has_table_privilege('anon','public.live_game_grants','select');
 assert not has_table_privilege('authenticated','public.training_attempts','insert');
end $$;
