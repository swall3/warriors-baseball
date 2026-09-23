begin;

-- Existing practice batches were queued one email per player. Preserve them for
-- inspection, but do not release a burst when the scheduled worker starts.
update public.notification_outbox
set status = 'review',
    last_error = 'Earlier practice batch held for review; open InningWise for assignments.'
where status = 'pending' and kind = 'training_assigned' and attempts = 0;

-- A single action can assign many players. One notice per team and ten-minute
-- window is enough to alert the owner without mailing once per player.
create or replace function public.notify_training_assignment()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare t text; bucket bigint;
begin
 select team_id into t from public.players
 where org_id = new.org_id and id = new.player_id;
 bucket := floor(extract(epoch from now()) / 600)::bigint;
 perform public.queue_team_notification(
   new.org_id, t, 'training-batch:' || t || ':' || bucket,
   'training', 'training_assigned', '{}'
 );
 return new;
end $$;

-- The worker sees due organizations without downloading recipient rows.
create function public.due_notification_orgs(p_limit integer default 4)
returns setof text language sql security invoker set search_path = '' as $$
 select org_id from public.notification_outbox
 where status in ('pending', 'sending')
   and next_attempt_at <= now()
   and (lock_until is null or lock_until < now())
 group by org_id
 order by min(next_attempt_at), org_id
 limit least(greatest(p_limit, 1), 4);
$$;
revoke all on function public.due_notification_orgs(integer) from public, anon, authenticated;
grant execute on function public.due_notification_orgs(integer) to service_role;

commit;
