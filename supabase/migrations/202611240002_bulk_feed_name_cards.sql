begin;

create or replace function public.admin_set_feed_name_cards(
  p_username text, p_password text, p_ids bigint[], p_enabled boolean
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user jsonb;
  v_updated integer;
  v_requested integer;
begin
  if nullif(p_password, '') is not null then
    v_user := public.authenticate_app_user(p_username, p_password);
  else
    select jsonb_build_object('username', username, 'rights', rights) into v_user
      from public.app_users where auth_user_id = auth.uid();
  end if;
  if coalesce(v_user->>'username', '') <> 'owenheisenberg'
     or coalesce(v_user->>'rights', '') <> 'admin' then
    raise exception 'Only owenheisenberg can manage feed records' using errcode = '42501';
  end if;
  if p_enabled is null or p_ids is null or cardinality(p_ids) = 0
     or cardinality(p_ids) > 20 or array_position(p_ids, null) is not null then
    raise exception 'Select between 1 and 20 feed records and choose a setting';
  end if;
  select count(distinct selected_id)::integer into v_requested
    from unnest(p_ids) as selected_id;
  if v_requested <> cardinality(p_ids) then
    raise exception 'Selected feed records contain duplicates';
  end if;
  update public.feeds set show_name_card = p_enabled where id = any(p_ids);
  get diagnostics v_updated = row_count;
  if v_updated <> v_requested then
    raise exception 'One or more selected feed records no longer exist. Refresh the page and try again.';
  end if;
  return v_updated;
end;
$$;
revoke all on function public.admin_set_feed_name_cards(text,text,bigint[],boolean) from public;
grant execute on function public.admin_set_feed_name_cards(text,text,bigint[],boolean) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
