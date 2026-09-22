-- Notifications stop depending on team_billing. Same signature, same one-recipient rule:
-- the organization owner, resolved from org_members exactly as create_team resolves it.
begin;
create or replace function public.queue_team_notification(p_org text,p_team text,p_key text,p_category text,p_kind text,p_details jsonb)
returns void language sql security invoker set search_path='' as $$
 insert into public.notification_outbox(org_id,team_id,user_id,event_key,category,kind,details)
 select t.org_id,t.id,m.user_id,p_key,p_category,p_kind,p_details
 from public.org_members m
 join public.teams t on t.org_id=m.org_id and t.id=p_team
 join public.notification_preferences p
 on p.org_id=m.org_id and p.team_id=t.id and p.user_id=m.user_id
 join public.organizations o on o.id=m.org_id and o.active
 where m.org_id=p_org and m.role='owner' and
 case p_category when 'games' then p.games when 'training' then p.training when 'billing' then p.billing else false end
 on conflict(org_id,team_id,user_id,event_key) do nothing;
$$;

-- Billing state is organization-wide now. The outbox stays per team so the existing
-- unique(org_id,team_id,user_id,event_key) key and the per-team claim path are preserved.
drop trigger if exists queue_billing_email on public.team_billing;
create or replace function public.notify_org_billing_change() returns trigger language plpgsql security invoker set search_path='' as $$
declare k text; d jsonb; t record;
begin
 if new.subscription_status is distinct from old.subscription_status or new.cancel_at_period_end is distinct from old.cancel_at_period_end then
  k:='billing:'||gen_random_uuid()::text;
  d:=jsonb_build_object('status',new.subscription_status,'cancelAtPeriodEnd',new.cancel_at_period_end,'seats',new.seats);
  for t in select id from public.teams where org_id=new.org_id and kind='own' loop
   perform public.queue_team_notification(new.org_id,t.id,k,'billing','billing_changed',d);
  end loop;
 end if;
 return new;
end $$;
drop trigger if exists queue_org_billing_email on public.org_billing;
create trigger queue_org_billing_email after update on public.org_billing for each row execute function public.notify_org_billing_change();
revoke all on function public.notify_org_billing_change() from public,anon,authenticated;
grant execute on function public.notify_org_billing_change() to service_role;
commit;
