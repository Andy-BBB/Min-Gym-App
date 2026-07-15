-- =========================================================
-- Hämta eller skapa användarens personliga workspace
-- =========================================================

create or replace function public.get_or_create_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_workspace_id uuid;
begin
    -- Hämta den inloggade användarens ID
    v_user_id := auth.uid();

    -- Funktionen får endast användas av en inloggad användare
    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    -- Förhindrar att två samtidiga anrop skapar dubbla workspaces
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_user_id::text, 0)
    );

    -- Leta efter användarens eget personliga workspace.
    -- Ett workspace där användaren bara är PT/medlem räknas inte.
    select w.id
    into v_workspace_id
    from public.workspaces w
    inner join public.workspace_members wm
        on wm.workspace_id = w.id
    where w.created_by = v_user_id
      and wm.user_id = v_user_id
    order by w.created_at asc
    limit 1;

    -- Returnera befintligt workspace
    if v_workspace_id is not null then
        return v_workspace_id;
    end if;

    -- Skapa ett nytt personligt workspace
    insert into public.workspaces (
        name,
        created_by
    )
    values (
        'Mitt Gym',
        v_user_id
    )
    returning id into v_workspace_id;

    -- Lägg till användaren som medlem i sitt workspace
    insert into public.workspace_members (
        workspace_id,
        user_id
    )
    values (
        v_workspace_id,
        v_user_id
    );

    return v_workspace_id;
end;
$$;


-- Funktionen ska inte kunna anropas av oinloggade användare
revoke execute
on function public.get_or_create_personal_workspace()
from public, anon;

-- Endast autentiserade användare får anropa funktionen
grant execute
on function public.get_or_create_personal_workspace()
to authenticated;