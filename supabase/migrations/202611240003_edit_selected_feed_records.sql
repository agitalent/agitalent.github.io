begin;

create or replace function public.admin_update_feed_records(
  p_username text, p_password text, p_updates jsonb
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user jsonb;
  v_item jsonb;
  v_feed public.feeds%rowtype;
  v_id bigint;
  v_distinct integer;
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
  if jsonb_typeof(p_updates) is distinct from 'array'
     or jsonb_array_length(p_updates) < 2
     or jsonb_array_length(p_updates) > 20 then
    raise exception 'Select between 2 and 20 feed records';
  end if;
  select count(distinct (value->>'id')::bigint)::integer into v_distinct
    from jsonb_array_elements(p_updates);
  if v_distinct <> jsonb_array_length(p_updates) then
    raise exception 'Selected feed records contain duplicate or invalid IDs';
  end if;

  -- Lock and validate every selected record before changing any of them.
  for v_item in
    select value from jsonb_array_elements(p_updates)
      order by (value->>'id')::bigint
  loop
    v_id := (v_item->>'id')::bigint;
    select * into v_feed from public.feeds where id = v_id for update;
    if not found then
      raise exception 'A selected feed record no longer exists. Refresh and try again.';
    end if;
    if jsonb_typeof(v_item->'original') is distinct from 'object'
       or v_item->'original' is distinct from (to_jsonb(v_feed) - 'id') then
      raise exception 'A selected feed record has changed. Refresh and try again.';
    end if;
    if jsonb_typeof(v_item->'record') is distinct from 'object'
       or jsonb_typeof(v_item->'record'->'name') is distinct from 'string'
       or jsonb_typeof(v_item->'record'->'title') is distinct from 'string'
       or jsonb_typeof(v_item->'record'->'update') is distinct from 'string'
       or jsonb_typeof(v_item->'record'->'date') is distinct from 'string'
       or jsonb_typeof(v_item->'record'->'show_name_card') is distinct from 'boolean' then
      raise exception 'Name, title, update, date, and name card setting must be provided';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_updates) loop
    v_id := (v_item->>'id')::bigint;
    update public.feeds set
      name = v_item->'record'->>'name',
      title = v_item->'record'->>'title',
      "update" = v_item->'record'->>'update',
      date = (v_item->'record'->>'date')::date,
      show_name_card = (v_item->'record'->>'show_name_card')::boolean
      where id = v_id;
  end loop;
  return jsonb_array_length(p_updates);
end;
$$;
revoke all on function public.admin_update_feed_records(text,text,jsonb) from public;
grant execute on function public.admin_update_feed_records(text,text,jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
