begin;
create table if not exists public.feed_display_settings (
  id boolean primary key default true check (id),
  candidate_cards_enabled boolean not null default true
);
insert into public.feed_display_settings (id) values (true) on conflict do nothing;
alter table public.feed_display_settings enable row level security;
drop policy if exists "read feed display settings" on public.feed_display_settings;
create policy "read feed display settings" on public.feed_display_settings for select using (true);
grant select on public.feed_display_settings to anon, authenticated;
revoke insert, update, delete, truncate on public.feed_display_settings from anon, authenticated;

create or replace function public.admin_set_feed_candidate_cards(
  p_username text, p_password text, p_enabled boolean
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user jsonb;
begin
  if nullif(p_password, '') is not null then
    v_user := public.authenticate_app_user(p_username, p_password);
  else
    select jsonb_build_object('username', username, 'rights', rights) into v_user
      from public.app_users where auth_user_id = auth.uid();
  end if;
  if coalesce(v_user->>'username', '') <> 'owenheisenberg'
     or coalesce(v_user->>'rights', '') <> 'admin' then
    raise exception 'Only owenheisenberg can change feed display settings' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'Setting must be true or false'; end if;
  insert into public.feed_display_settings (id, candidate_cards_enabled) values (true, p_enabled)
    on conflict (id) do update set candidate_cards_enabled = excluded.candidate_cards_enabled;
end;
$$;
revoke all on function public.admin_set_feed_candidate_cards(text,text,boolean) from public;
grant execute on function public.admin_set_feed_candidate_cards(text,text,boolean) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
