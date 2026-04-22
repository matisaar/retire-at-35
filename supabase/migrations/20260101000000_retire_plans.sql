create table if not exists public.retire_plans (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.retire_plans enable row level security;

drop policy if exists "anon read" on public.retire_plans;
drop policy if exists "anon insert" on public.retire_plans;
drop policy if exists "anon update" on public.retire_plans;

create policy "anon read"   on public.retire_plans for select using (true);
create policy "anon insert" on public.retire_plans for insert with check (true);
create policy "anon update" on public.retire_plans for update using (true) with check (true);

alter publication supabase_realtime add table public.retire_plans;
