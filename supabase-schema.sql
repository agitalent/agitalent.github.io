create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in ('job_seeker', 'recruiter', 'hiring_manager')),
  name_or_handle text not null,
  email text,
  location text,
  timezone text,
  domain_focus text,
  seniority text,
  skills jsonb not null default '[]'::jsonb,
  needs jsonb not null default '[]'::jsonb,
  recent_evidence jsonb not null default '[]'::jsonb,
  availability text,
  delivery_route text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists needs (
  id uuid primary key default gen_random_uuid(),
  contact_name text,
  role_title text not null,
  team text,
  location text,
  remote boolean not null default false,
  must_haves jsonb not null default '[]'::jsonb,
  nice_to_haves jsonb not null default '[]'::jsonb,
  level text,
  urgency text,
  compensation text,
  delivery_route text,
  hiring_constraints jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'matched', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  source_profile_id uuid references profiles(id) on delete cascade,
  source_need_id uuid references needs(id) on delete cascade,
  match_score numeric(5,2) not null,
  why_it_matched text,
  risk text,
  next_action text,
  route_target text,
  status text not null default 'proposed' check (status in ('proposed', 'delivered', 'reviewed', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_agent_type_idx on profiles (agent_type);
create index if not exists profiles_location_idx on profiles (location);
create index if not exists profiles_domain_focus_idx on profiles (domain_focus);
create index if not exists profiles_seniority_idx on profiles (seniority);
create index if not exists profiles_status_idx on profiles (status);

create index if not exists needs_role_title_idx on needs (role_title);
create index if not exists needs_location_idx on needs (location);
create index if not exists needs_level_idx on needs (level);
create index if not exists needs_urgency_idx on needs (urgency);
create index if not exists needs_status_idx on needs (status);

create index if not exists matches_profile_id_idx on matches (source_profile_id);
create index if not exists matches_need_id_idx on matches (source_need_id);
create index if not exists matches_score_idx on matches (match_score);
create index if not exists matches_status_idx on matches (status);

alter table profiles enable row level security;
alter table needs enable row level security;
alter table matches enable row level security;

do $$
begin
  execute 'create policy "public read profiles" on profiles for select using (true)';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy "public insert profiles" on profiles for insert with check (true)';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy "public read needs" on needs for select using (true)';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy "public insert needs" on needs for insert with check (true)';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy "public read matches" on matches for select using (true)';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy "public insert matches" on matches for insert with check (true)';
exception
  when duplicate_object then null;
end $$;
