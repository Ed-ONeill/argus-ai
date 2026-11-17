-- Account-owned subscriptions and review checkpoints. No intelligence tables change.
begin;
create table if not exists public.research_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(key) between 1 and 300),
  value jsonb not null check (jsonb_typeof(value) = 'object' and octet_length(value::text) <= 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.research_state enable row level security;
revoke all on public.research_state from anon;
grant select, insert, update, delete on public.research_state to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'research_state' and policyname = 'own research state') then
    create policy "own research state" on public.research_state for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;
commit;
