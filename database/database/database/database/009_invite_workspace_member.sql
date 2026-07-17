-- =========================================================
-- Lägg till en befintlig användare som medlem i ett workspace
-- =========================================================

create or replace function public.invite_workspace_member(
    p_workspace_id uuid,
    p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_current_user_id uuid;
    v_invited_user_id uuid;
    v_display_name text;
    v_normalized_email text;
begin
    -- Hämta inloggad användare
    v_current_user_id := auth.uid();

    if v_current_user_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    -- Kontrollera inkommande värden
    if p_workspace_id is null then
        raise exception 'Workspace is required'
            using errcode = '22004';
    end if;

    v_normalized_email := pg_catalog.lower(
        pg_catalog.btrim(p_email)
    );

    if v_normalized_email is null
       or v_normalized_email = '' then
        raise exception 'Email is required'
            using errcode = '22004';
    end if;

    -- Den som bjuder in måste själv vara medlem
    if not exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = v_current_user_id
    ) then
        raise exception 'You do not have access to this workspace'
            using errcode = '42501';
    end if;

    -- Leta upp användaren i Supabase Auth
    select au.id
    into v_invited_user_id
    from auth.users au
    where pg_catalog.lower(au.email) = v_normalized_email
    limit 1;

    if v_invited_user_id is null then
        raise exception 'No user exists with this email address'
            using errcode = 'P0002';
    end if;

    -- Användaren behöver inte bjuda in sig själv
    if v_invited_user_id = v_current_user_id then
        raise exception 'You are already a member of this workspace'
            using errcode = '23505';
    end if;

    -- Stoppa dubbletter med ett begripligt fel
    if exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = v_invited_user_id
    ) then
        raise exception 'The user is already a member of this workspace'
            using errcode = '23505';
    end if;

    -- Återanvänd personens befintliga namn om det finns
    select wm.display_name
    into v_display_name
    from public.workspace_members wm
    where wm.user_id = v_invited_user_id
      and wm.display_name is not null
      and pg_catalog.btrim(wm.display_name) <> ''
    order by wm.updated_at desc
    limit 1;

    -- Lägg till medlemmen
    insert into public.workspace_members (
        workspace_id,
        user_id,
        display_name
    )
    values (
        p_workspace_id,
        v_invited_user_id,
        v_display_name
    );

    return v_invited_user_id;
end;
$$;


-- Oinloggade användare ska inte kunna anropa funktionen
revoke execute
on function public.invite_workspace_member(uuid, text)
from public, anon;

-- Inloggade användare får anropa funktionen
grant execute
on function public.invite_workspace_member(uuid, text)
to authenticated;