-- =========================================================
-- Ta bort medlem från ett workspace
-- =========================================================

create or replace function public.remove_workspace_member(
    p_workspace_id uuid,
    p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_user_id uuid;
    v_owner_id uuid;
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

    if p_user_id is null then
        raise exception 'User is required'
            using errcode = '22004';
    end if;

    -- Den inloggade användaren måste vara medlem
    if not exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = v_current_user_id
    ) then
        raise exception 'You do not have access to this workspace'
            using errcode = '42501';
    end if;

    -- Hämta workspace-ägaren
    select created_by
    into v_owner_id
    from public.workspaces
    where id = p_workspace_id;

    if v_owner_id is null then
        raise exception 'Workspace not found'
            using errcode = 'P0002';
    end if;

    -- Ägaren får inte tas bort
    if p_user_id = v_owner_id then
        raise exception 'The workspace owner cannot be removed'
            using errcode = '42501';
    end if;

    -- Ta bort medlemmen
    delete
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_user_id;

end;
$$;


revoke execute
on function public.remove_workspace_member(uuid, uuid)
from public, anon;

grant execute
on function public.remove_workspace_member(uuid, uuid)
to authenticated;