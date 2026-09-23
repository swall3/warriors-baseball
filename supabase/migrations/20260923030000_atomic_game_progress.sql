-- A single row lock protects each player's aggregate from simultaneous answers.
-- Keep a bounded set of request IDs so a repeated HTTP request is harmless.
begin;

alter table public.game_progress
  add column recent_attempts uuid[] not null default '{}';

create or replace function public.record_game_progress(
  p_org text,
  p_player text,
  p_key text,
  p_attempt uuid,
  p_correct boolean,
  p_streak integer default null,
  p_best integer default null
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  progress public.game_progress%rowtype;
  attempts uuid[];
begin
  if p_attempt is null or p_correct is null or
     p_key !~ '^[a-z0-9_-]{1,64}$' or
     p_streak < 0 or p_best < 0 then
    raise exception 'Invalid game progress' using errcode = '22023';
  end if;

  insert into public.game_progress (org_id, player_id, game_key)
  values (p_org, p_player, p_key)
  on conflict (org_id, player_id, game_key) do nothing;

  select * into progress from public.game_progress
  where org_id = p_org and player_id = p_player and game_key = p_key
  for update;
  if p_attempt = any(progress.recent_attempts) then
    return false;
  end if;

  attempts := array_append(progress.recent_attempts, p_attempt);
  if cardinality(attempts) > 64 then
    attempts := attempts[cardinality(attempts) - 63:cardinality(attempts)];
  end if;
  update public.game_progress
  set correct = progress.correct + case when p_correct then 1 else 0 end,
      total = progress.total + 1,
      streak = coalesce(p_streak, progress.streak),
      best_streak = greatest(progress.best_streak, p_best),
      recent_attempts = attempts,
      updated_at = now()
  where org_id = p_org and player_id = p_player and game_key = p_key;
  return true;
end;
$$;

revoke all on function public.record_game_progress(text,text,text,uuid,boolean,integer,integer)
  from public, anon, authenticated;
grant execute on function public.record_game_progress(text,text,text,uuid,boolean,integer,integer)
  to service_role;

commit;
