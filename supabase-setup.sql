-- Run this in your Supabase SQL editor to create the signups table

create table if not exists tryout_signups (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  age integer not null,
  parent_name text not null,
  phone text not null,
  email text not null,
  position text,
  experience text,
  notes text,
  signed_up_at timestamptz default now()
);

-- Optional: disable public read access (admin API uses service role key)
alter table tryout_signups enable row level security;

-- Only allow inserts from the public (the signup form uses anon key in future; right now uses service role)
-- For full security, add RLS policies as needed.
