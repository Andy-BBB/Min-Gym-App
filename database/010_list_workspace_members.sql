-- =========================================================
-- Lista medlemmar i ett workspace
-- =========================================================
create or replace function public.list_workspace_members(
    p_workspace_id uuid
)
returns table (
    user_id uuid,
    display_name text,
    email text,
    is_owner boolean,
    is_current_user boolean,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_user_id uuid;
begin
    v_current_user_id := auth.uid();

    if v_current_user_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if p_workspace_id is null then
        raise exception 'Workspace is required'
            using errcode = '22004';
    end if;

    if not exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = v_current_user_id
    ) then
        raise exception 'You do not have access to this workspace'
            using errcode = '42501';
    end if;

    return query
    select
        wm.user_id,
        wm.display_name,
        au.email::text,
        wm.user_id = w.created_by as is_owner,
        wm.user_id = v_current_user_id as is_current_user,
        wm.created_at
    from public.workspace_members wm
inner join public.workspaces w
    on w.id = wm.workspace_id
inner join auth.users au
    on au.id = wm.user_id
where wm.workspace_id = p_workspace_id
    order by
        case when wm.user_id = w.created_by then 0 else 1 end,
        lower(
            coalesce(
                nullif(
                    btrim(wm.display_name),
                    ''
                ),
                'Namnlös medlem'
            )
        ),
        wm.created_at;
end;
$$;

revoke execute
on function public.list_workspace_members(uuid)
from public, anon;

grant execute
on function public.list_workspace_members(uuid)
to authenticated;