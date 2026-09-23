begin;

-- Learning-game progress per kid (parent view Phase 3).
-- Aggregate row per (org, player, game_key) — one running correct/total,
-- not per-attempt history (Stuart's decision 2026-09-22). Written when a
-- parent has a kid selected in /games; the kid-less coach/kid case keeps
-- using localStorage untouched.
create table public.game_progress (
  org_id text not null references public.organizations(id),
  player_id text not null references public.players(id) on delete cascade,
  -- Which game/skill: "rules", "backup", "position", "daily", or a skill
  -- category key. Free text so gameStorage need not import the catalog.
  game_key text not null,
  correct integer not null default 0 check (correct >= 0),
  total integer not null default 0 check (total >= 0),
  -- Daily-streak fields are only meaningful for game_key = 'daily'; null
  -- elsewhere. Kept on the same row rather than a second table because a
  -- kid has exactly one daily streak.
  streak integer,
  best_streak integer,
  updated_at timestamptz not null default now(),
  primary key (org_id, player_id, game_key),
  check (correct <= total)
);

create index game_progress_player
  on public.game_progress(org_id, player_id);

alter table public.game_progress enable row level security;
revoke all on public.game_progress from public, anon, authenticated;
grant select, insert, update, delete on public.game_progress to service_role;

commit;
