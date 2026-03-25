create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in ('job_seeker', 'recruiter', 'hiring_manager')),
  name_or_handle text not null,
  email text,
  bio_link text,
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
  email text,
  company_name text,
  role_title text not null,
  post_link text,
  source_platform text,
  source_board text,
  external_job_id text,
  team text,
  location text,
  remote boolean not null default false,
  must_haves jsonb not null default '[]'::jsonb,
  nice_to_haves jsonb not null default '[]'::jsonb,
  summary text,
  compensation text,
  delivery_route text,
  hiring_constraints jsonb not null default '[]'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
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

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('NEW_PROFILE', 'NEW_NEED', 'MATCH_CREATED')),
  entity_type text not null check (entity_type in ('profile', 'need', 'match')),
  entity_id uuid not null,
  producer_agent_type text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_agent_type_idx on profiles (agent_type);
create index if not exists profiles_location_idx on profiles (location);
create index if not exists profiles_domain_focus_idx on profiles (domain_focus);
create index if not exists profiles_seniority_idx on profiles (seniority);
create index if not exists profiles_status_idx on profiles (status);

create index if not exists needs_role_title_idx on needs (role_title);
create index if not exists needs_company_name_idx on needs (company_name);
create index if not exists needs_post_link_idx on needs (post_link);
create index if not exists needs_source_platform_idx on needs (source_platform);
create index if not exists needs_source_board_external_job_id_idx on needs (source_board, external_job_id);
create index if not exists needs_location_idx on needs (location);
create index if not exists needs_status_idx on needs (status);

drop index if exists needs_level_idx;
drop index if exists needs_urgency_idx;

alter table needs drop column if exists level;
alter table needs drop column if exists urgency;

alter table needs add column if not exists source_platform text;
alter table needs add column if not exists source_board text;
alter table needs add column if not exists external_job_id text;
alter table needs add column if not exists summary text;
alter table needs add column if not exists source_payload jsonb not null default '{}'::jsonb;
alter table needs add column if not exists posted_at timestamptz;
alter table needs add column if not exists first_seen_at timestamptz not null default now();
alter table needs add column if not exists last_seen_at timestamptz not null default now();

create index if not exists matches_profile_id_idx on matches (source_profile_id);
create index if not exists matches_need_id_idx on matches (source_need_id);
create index if not exists matches_score_idx on matches (match_score);
create index if not exists matches_status_idx on matches (status);

create index if not exists events_type_created_idx on events (event_type, created_at desc);
create index if not exists events_entity_idx on events (entity_type, entity_id);

alter table profiles enable row level security;
alter table needs enable row level security;
alter table matches enable row level security;
alter table events enable row level security;

grant usage on schema public to anon, authenticated;
grant select on profiles, needs, matches, events to anon, authenticated;
grant insert on profiles, needs, matches, events to anon, authenticated;

create or replace function public.search_profiles_sql(search_sql text, page_limit integer default 20, page_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_sql text;
  rows_payload jsonb;
  total_count bigint;
begin
  normalized_sql := trim(coalesce(search_sql, ''));

  if normalized_sql = '' then
    normalized_sql := 'select * from profiles order by created_at desc nulls last, updated_at desc nulls last';
  end if;

  if page_limit is null or page_limit < 1 then
    page_limit := 20;
  end if;

  if page_limit > 20 then
    page_limit := 20;
  end if;

  if page_offset is null or page_offset < 0 then
    page_offset := 0;
  end if;

  if normalized_sql ~ ';'
    or normalized_sql ~* '\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|comment|copy)\b'
    or normalized_sql !~* '^\s*select\b'
    or normalized_sql !~* '\bfrom\s+profiles\b'
    or normalized_sql ~* '\blimit\b'
    or normalized_sql ~* '\boffset\b'
  then
    raise exception 'Only SELECT queries against profiles without LIMIT/OFFSET are allowed.';
  end if;

  execute format('select count(*) from (%s) as base_query', normalized_sql) into total_count;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(paged_query)), ''[]''::jsonb) from (%s limit %s offset %s) as paged_query',
    normalized_sql,
    page_limit,
    page_offset
  ) into rows_payload;

  return jsonb_build_object(
    'rows', coalesce(rows_payload, '[]'::jsonb),
    'count', coalesce(total_count, 0),
    'limit', page_limit,
    'offset', page_offset
  );
end;
$$;

grant execute on function public.search_profiles_sql(text, integer, integer) to anon, authenticated;

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

do $$
begin
  execute 'create policy "public read events" on events for select using (true)';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  execute 'create policy "public insert events" on events for insert with check (true)';
exception
  when duplicate_object then null;
end $$;
