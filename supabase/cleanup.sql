-- ============================================================================
--  Colour Wars — automatic game row cleanup
--  Run this ONCE against your Supabase project (SQL editor → paste → Run).
--
--  What it does:
--    1. Adds an `updated_at` column to `games` (auto-bumped on every UPDATE).
--    2. Instantly deletes rows when they become `finished` (2-minute grace
--       window so both players can see the final board + use rematch).
--    3. Schedules a pg_cron job that every minute sweeps:
--         · finished games older than 2 minutes
--         · waiting lobbies older than 10 minutes (nobody joined)
--         · abandoned placement/playing games older than 60 minutes
--       → covers the "both players left" case via age of last activity,
--         since every move bumps updated_at.
-- ============================================================================

-- ── 1. updated_at column + trigger ───────────────────────────────────────────

alter table public.games
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_games_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_games_updated_at();

-- ── 2. Cleanup function ──────────────────────────────────────────────────────
-- Deletes rows in 3 categories. Safe to call repeatedly.

create or replace function public.cleanup_games()
returns void
language plpgsql
security definer
as $$
begin
  -- Finished games: 2-minute grace for the winner screen + rematch flow
  delete from public.games
  where status = 'finished'
    and updated_at < now() - interval '2 minutes';

  -- Waiting lobbies nobody joined
  delete from public.games
  where status = 'waiting'
    and updated_at < now() - interval '10 minutes';

  -- Active games with no activity for an hour → both players walked away
  delete from public.games
  where status in ('placement_blue', 'placement_red', 'playing')
    and updated_at < now() - interval '60 minutes';
end;
$$;

-- ── 3. pg_cron schedule ──────────────────────────────────────────────────────
-- Supabase exposes pg_cron already; this just registers a job.

create extension if not exists pg_cron with schema extensions;

-- Idempotent re-registration
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-games') then
    perform cron.unschedule('cleanup-games');
  end if;
  perform cron.schedule(
    'cleanup-games',
    '* * * * *',
    $cleanup$ select public.cleanup_games(); $cleanup$
  );
end $$;

-- ── 4. (Optional) inspect the schedule ───────────────────────────────────────
-- select jobid, schedule, command, active from cron.job where jobname = 'cleanup-games';
-- select * from cron.job_run_details order by start_time desc limit 10;
