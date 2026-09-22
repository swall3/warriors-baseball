-- Organization-scoped billing. Additive and inert: nothing reads these objects yet.
-- team_billing remains the live billing row until the org-scope move lands.
begin;
create table if not exists public.org_billing (
 id uuid primary key default gen_random_uuid(),
 org_id text not null unique references public.organizations(id) on delete restrict,
 owner_user_id uuid references auth.users(id) on delete set null,
 complimentary boolean not null default false,
 seats integer not null default 0 check(seats between 0 and 500),
 pending_seats integer check(pending_seats between 1 and 500),
 pending_seats_at timestamptz,
 billing_interval text check(billing_interval in ('month','year')),
 stripe_customer_id text unique,
 stripe_subscription_id text unique,
 subscription_status text not null default 'none' check(subscription_status in ('none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
 current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,
 trial_used boolean not null default false,
 checkout_attempt uuid,
 checkout_started_at timestamptz,
 checkout_interval text check(checkout_interval in ('month','year')),
 checkout_seats integer,
 checkout_price_id text,
 checkout_session_id text,
 lock_token uuid,
 lock_until timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists org_billing_owner_idx on public.org_billing(owner_user_id);
alter table public.org_billing enable row level security;
revoke all on public.org_billing from public,anon,authenticated;
grant select,insert,update on public.org_billing to service_role;

-- Seat state lives on teams: every seat chokepoint already loads the team row.
alter table public.teams add column if not exists seat_state text not null default 'active';
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.teams'::regclass and conname='teams_seat_state_check') then
  alter table public.teams add constraint teams_seat_state_check check(seat_state in ('active','read_only'));
 end if;
end$$;
-- created_at gives downgrade ordering a deterministic rule (newest retired first).
alter table public.teams add column if not exists created_at timestamptz not null default now();
update public.teams set created_at=now() where created_at is null;
alter table public.teams alter column created_at set default now();
alter table public.teams alter column created_at set not null;
create index if not exists teams_org_seat_state_idx on public.teams(org_id,seat_state) where kind='own';

-- Same 3-minute lease semantics as acquire_billing_lease, retargeted at org_billing.
-- Stripe network requests cannot live inside a Postgres transaction.
create or replace function public.acquire_org_billing_lease(p_id uuid,p_token uuid)
returns boolean language sql security invoker set search_path=public as $$
 with acquired as (
 update public.org_billing set lock_token=p_token,lock_until=now()+interval '3 minutes'
 where id=p_id and (lock_until is null or lock_until<now()) returning id
 ) select exists(select 1 from acquired);
$$;
revoke all on function public.acquire_org_billing_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.acquire_org_billing_lease(uuid,uuid) to service_role;

-- One row per org that already has any team_billing row. Stripe ids are deliberately
-- not carried over: a per-team test-mode customer is not an organization customer.
insert into public.org_billing (org_id, owner_user_id, complimentary, seats)
select b.org_id,
       coalesce(
         (select m.user_id from public.org_members m
          where m.org_id=b.org_id and m.role='owner' order by m.created_at limit 1),
         min(b.owner_user_id::text)::uuid
       ),
       bool_or(b.complimentary),
       (select count(*) from public.teams t
        where t.org_id=b.org_id and t.kind='own')
from public.team_billing b group by b.org_id
on conflict (org_id) do nothing;
commit;
