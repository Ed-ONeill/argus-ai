-- ============================================================
-- Argus V1 — User Schema
-- Paste into Supabase SQL Editor and run.
-- ============================================================

-- ── profiles ──────────────────────────────────────────────────────────────────
-- One row per user, auto-created by trigger on sign-up.

create table if not exists public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  display_name text,
  avatar_url   text,
  created_at   timestamptz default now() not null
);

-- Trigger: auto-insert a profile row whenever a new auth.users row is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── saved_items ───────────────────────────────────────────────────────────────
-- Stores bookmarked FeedItems per user.  item_id is the FeedItem.id from the
-- Python backend (string hash / UUID depending on source).

create table if not exists public.saved_items (
  id               uuid    primary key default gen_random_uuid(),
  user_id          uuid    references auth.users on delete cascade not null,
  item_id          text    not null,
  title            text    not null,
  url              text    not null,
  source           text,
  category         text,
  published        text,
  signal_score     numeric(5,2),
  signal_strength  text,
  summary          text,
  why_it_matters   text,
  impact           text,
  saved_at         timestamptz default now() not null,
  unique (user_id, item_id)
);

create index if not exists saved_items_user_id_idx on public.saved_items (user_id);


-- ── watchlist ─────────────────────────────────────────────────────────────────
-- Ticker / sector / theme subscriptions per user.
-- item_type: "ticker" | "sector" | "theme"

create table if not exists public.watchlist (
  id        uuid  primary key default gen_random_uuid(),
  user_id   uuid  references auth.users on delete cascade not null,
  item_id   text  not null,
  item_type text  not null default 'ticker',
  added_at  timestamptz default now() not null,
  unique (user_id, item_id)
);

create index if not exists watchlist_user_id_idx on public.watchlist (user_id);


-- ── user_preferences ─────────────────────────────────────────────────────────
-- One row per user, created on first preference save.

create table if not exists public.user_preferences (
  user_id             uuid    references auth.users on delete cascade primary key,
  default_categories  text[]  default '{}',
  default_sources     text[]  default '{}',
  ai_enabled          boolean default true,
  updated_at          timestamptz default now() not null
);


-- ── Row Level Security ────────────────────────────────────────────────────────
-- All tables: users can only access their own rows.

alter table public.profiles          enable row level security;
alter table public.saved_items       enable row level security;
alter table public.watchlist         enable row level security;
alter table public.user_preferences  enable row level security;

-- profiles
create policy "own profile select"
  on public.profiles for select using (auth.uid() = id);
create policy "own profile update"
  on public.profiles for update using (auth.uid() = id);

-- saved_items
create policy "own saved_items select"
  on public.saved_items for select using (auth.uid() = user_id);
create policy "own saved_items insert"
  on public.saved_items for insert with check (auth.uid() = user_id);
create policy "own saved_items delete"
  on public.saved_items for delete using (auth.uid() = user_id);

-- watchlist
create policy "own watchlist select"
  on public.watchlist for select using (auth.uid() = user_id);
create policy "own watchlist insert"
  on public.watchlist for insert with check (auth.uid() = user_id);
create policy "own watchlist delete"
  on public.watchlist for delete using (auth.uid() = user_id);

-- user_preferences
create policy "own preferences select"
  on public.user_preferences for select using (auth.uid() = user_id);
create policy "own preferences insert"
  on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "own preferences update"
  on public.user_preferences for update using (auth.uid() = user_id);
