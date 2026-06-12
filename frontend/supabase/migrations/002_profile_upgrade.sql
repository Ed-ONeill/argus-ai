-- ============================================================
-- Migration 002: Profile upgrade — names, onboarding, preferences
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Safe to run multiple times (all statements are idempotent)
-- ============================================================

-- ── 1. profiles — add name + onboarding columns ────────────────────────────

alter table public.profiles
  add column if not exists first_name           text,
  add column if not exists last_name            text,
  add column if not exists onboarding_completed boolean not null default false;

-- ── 2. Replace trigger: backfill names from auth metadata on signup ─────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, display_name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'first_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'last_name'),  ''),
    nullif(trim(coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'first_name'
    )), '')
  )
  on conflict (id) do update set
    first_name   = coalesce(public.profiles.first_name,   excluded.first_name),
    last_name    = coalesce(public.profiles.last_name,    excluded.last_name),
    display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
end;
$$;

-- Re-attach trigger (drop + recreate is idempotent)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 3. user_preferences — onboarding data ───────────────────────────────────

alter table public.user_preferences
  add column if not exists followed_sectors       text[] not null default '{}',
  add column if not exists followed_asset_classes text[] not null default '{}',
  add column if not exists user_role              text,
  add column if not exists region_focus           text;

-- ── 4. RLS: allow profile self-insert (defensive, trigger normally handles it) ─

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename   = 'profiles'
      and policyname  = 'own profile insert'
  ) then
    execute 'create policy "own profile insert"
      on public.profiles for insert with check (auth.uid() = id)';
  end if;
end $$;

-- ── 5. Backfill existing users from auth metadata ───────────────────────────
-- Only fills in NULL fields; never overwrites existing data.

update public.profiles p
set
  first_name = coalesce(p.first_name, nullif(trim(u.raw_user_meta_data->>'first_name'), '')),
  last_name  = coalesce(p.last_name,  nullif(trim(u.raw_user_meta_data->>'last_name'),  '')),
  display_name = coalesce(p.display_name, nullif(trim(coalesce(
    u.raw_user_meta_data->>'display_name',
    u.raw_user_meta_data->>'first_name'
  )), ''))
from auth.users u
where p.id = u.id;
