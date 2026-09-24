-- Team subscriptions are server-managed. Passcodes never confer billing ownership.
begin;
create table public.team_billing (
 id uuid primary key default gen_random_uuid(),
 org_id text not null,
 team_id text not null,
 owner_user_id uuid references auth.users(id) on delete set null,
 complimentary boolean not null default false,
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 subscription_status text not null default 'none' check(subscription_status in ('none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 trial_used boolean not null default false,
 checkout_attempt uuid,
 checkout_started_at timestamptz,
 checkout_interval text check(checkout_interval in ('month','year')),
 checkout_price_id text,
 checkout_session_id text,
 lock_token uuid,
 lock_until timestamptz,
 updated_at timestamptz not null default now(),
 unique(org_id,team_id),
 foreign key(org_id,team_id) references public.teams(org_id,id) on delete restrict
);
create index team_billing_owner_idx on public.team_billing(owner_user_id);
alter table public.team_billing enable row level security;
revoke all on public.team_billing from public,anon,authenticated;
grant select,insert,update on public.team_billing to service_role;

create table public.billing_webhook_events (
 event_id text primary key,
 event_type text not null,
 processed_at timestamptz not null default now()
);
alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from public,anon,authenticated;
grant select,insert on public.billing_webhook_events to service_role;

-- A lease serializes checkout, portal creation and webhook reconciliation.
-- Stripe network requests cannot live inside a Postgres transaction.
create function public.acquire_billing_lease(p_id uuid,p_token uuid)
returns boolean language sql security invoker set search_path=public as $$
 with acquired as (
 update public.team_billing set lock_token=p_token,lock_until=now()+interval '3 minutes'
 where id=p_id and (lock_until is null or lock_until<now()) returning id
 ) select exists(select 1 from acquired);
$$;
revoke all on function public.acquire_billing_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acquire_billing_lease(uuid,uuid) to service_role;
commit;
