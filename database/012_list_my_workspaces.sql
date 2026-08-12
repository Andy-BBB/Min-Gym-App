-- =========================================================
-- Lista alla workspaces som den inloggade användaren
-- är medlem i
-- =========================================================

create or replace function public.list_my_workspaces()
returns table (
    workspace_id uuid,
    workspace_name text,
    owner_user_id uuid,
    owner_display_name text,
    owner_email text,
    is_owner boolean
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

    return query
    select
        w.id as workspace_id,
        w.name::text as workspace_name,
        w.created_by as owner_user_id,
        owner_member.display_name as owner_display_name,
        owner_user.email::text as owner_email,
        w.created_by = v_current_user_id as is_owner
    from public.workspace_members current_member

    inner join public.workspaces w
        on w.id = current_member.workspace_id

    inner join public.workspace_members owner_member
        on owner_member.workspace_id = w.id
       and owner_member.user_id = w.created_by

    inner join auth.users owner_user
        on owner_user.id = w.created_by

    where current_member.user_id = v_current_user_id

    order by
        case
            when w.created_by = v_current_user_id then 0
            else 1
        end,
        lower(
            coalesce(
                nullif(
                    btrim(owner_member.display_name),
                    ''
                ),
                owner_user.email::text
            )
        );
end;
$$;


revoke execute
on function public.list_my_workspaces()
from public, anon;

grant execute
on function public.list_my_workspaces()
to authenticated;