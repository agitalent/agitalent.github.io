begin;

alter table public.feeds
  add column if not exists show_name_card boolean not null default true;
alter table public.feeds
  alter column show_name_card set default true;

create or replace function public.admin_manage_feed(
  p_username text, p_password text, p_action text, p_id bigint,
  p_original jsonb, p_record jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user jsonb;
  v_feed public.feeds%rowtype;
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
  if p_action is null or p_action not in ('save', 'delete') then
    raise exception 'Invalid feed action';
  end if;
  select * into v_feed from public.feeds where id = p_id for update;
  if not found then raise exception 'This record no longer exists. Refresh the feeds.'; end if;
  -- Older open pages omit the new field; preserve their existing edit behavior.
  if p_original is distinct from (
    case when p_original ? 'show_name_card' then to_jsonb(v_feed) - 'id'
    else to_jsonb(v_feed) - 'id' - 'show_name_card' end
  ) then
    raise exception 'This record has changed. Refresh the feeds before editing or deleting it.';
  end if;
  if p_action = 'delete' then
    delete from public.feeds where id = p_id;
    return jsonb_build_object('id', p_id, 'deleted', true);
  end if;
  if p_record is null or jsonb_typeof(p_record) <> 'object'
     or jsonb_typeof(p_record->'name') is distinct from 'string'
     or jsonb_typeof(p_record->'title') is distinct from 'string'
     or jsonb_typeof(p_record->'update') is distinct from 'string'
     or jsonb_typeof(p_record->'date') is distinct from 'string'
     or (p_record ? 'show_name_card' and jsonb_typeof(p_record->'show_name_card') is distinct from 'boolean') then
    raise exception 'Name, title, update, date, and name card setting must be provided';
  end if;
  update public.feeds set name = p_record->>'name', title = p_record->>'title',
    "update" = p_record->>'update', date = (p_record->>'date')::date,
    show_name_card = case when p_record ? 'show_name_card'
      then (p_record->>'show_name_card')::boolean else v_feed.show_name_card end
    where id = p_id returning * into v_feed;
  return to_jsonb(v_feed);
end;
$$;
revoke all on function public.admin_manage_feed(text,text,text,bigint,jsonb,jsonb) from public;
grant execute on function public.admin_manage_feed(text,text,text,bigint,jsonb,jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
