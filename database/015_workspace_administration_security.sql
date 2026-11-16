-- =========================================================
-- 015: Ägarstyrd workspace-administration
-- FÖRSLAG: inte körd eller verifierad mot den verkliga databasen.
-- =========================================================
-- Kör först i ett SEPARAT testprojekt med syntetiska användare/data.
-- Ändrar inga träningspolicyer, tränings-RPC:er, mål eller träningsrader.
-- Hela migrationen är en transaktion; ett fel ska ge ROLLBACK.
-- Kör med en administrativ migrationsroll, aldrig från frontend.
--
-- KONTROLLERA FÖRE KÖRNING (grundschemat saknas i repositoryt):
-- 1. Jämför verkliga RPC-definitioner med 003, 009 och 011. Avbryt om
--    databasen har senare valideringar som inte finns i dessa filer.
-- 2. Granska ALLA policyer, effektiva/ärvda privilegier, funktionsägare,
--    triggers, skrivbara vyer och andra exponerade SECURITY DEFINER-RPC:er
--    som kan skriva till workspaces/workspace_members. Dessa kan inte
--    fastställas från repositoryt. Andra privilegierade skrivvägar måste
--    följa samma regler innan säkerhetsuppdateringen kan godkännas.
-- 3. Verifiera att befintliga SELECT-policyer låter medlemmar läsa sitt
--    workspace och relevanta medlemsrader. De ändras INTE här.
-- 4. Kontrollera FK ON DELETE och triggers för workspace-radering.
--    Ägarradering kan radera all underliggande träningsdata via CASCADE.
-- 5. Kontrollera profilens eventuella updated_at-trigger. Frontend skickar
--    endast display_name; updated_at får vid behov skötas av en betrodd
--    trigger, inte kräva generell UPDATE för användaren.
--
-- Läsbara inventeringsfrågor (för separat granskning, ej del av körningen):
-- SELECT * FROM pg_catalog.pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('workspaces', 'workspace_members');
-- SELECT c.oid::regclass, c.relowner::regrole, c.relrowsecurity,
--        c.relforcerowsecurity, c.relacl
-- FROM pg_catalog.pg_class c
-- WHERE c.oid IN ('public.workspaces'::regclass,
--                 'public.workspace_members'::regclass);
-- SELECT a.attrelid::regclass, a.attname, a.attacl
-- FROM pg_catalog.pg_attribute a
-- WHERE a.attrelid IN ('public.workspaces'::regclass,
--                     'public.workspace_members'::regclass)
--   AND a.attnum > 0 AND NOT a.attisdropped;
-- SELECT p.oid::regprocedure, p.proowner::regrole, p.prosecdef,
--        p.proconfig, p.proacl, pg_catalog.pg_get_functiondef(p.oid)
-- FROM pg_catalog.pg_proc p
-- JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prokind = 'f';
-- SELECT tgrelid::regclass, pg_catalog.pg_get_triggerdef(oid)
-- FROM pg_catalog.pg_trigger
-- WHERE tgrelid IN ('public.workspaces'::regclass,
--                   'public.workspace_members'::regclass)
--   AND NOT tgisinternal;
-- SELECT conrelid::regclass, confrelid::regclass,
--        pg_catalog.pg_get_constraintdef(oid)
-- FROM pg_catalog.pg_constraint
-- WHERE contype = 'f'
--   AND (conrelid IN ('public.workspaces'::regclass,
--                    'public.workspace_members'::regclass)
--        OR confrelid IN ('public.workspaces'::regclass,
--                        'public.workspace_members'::regclass));
-- SELECT * FROM pg_catalog.pg_auth_members;
-- SELECT rolname, rolsuper, rolbypassrls, rolinherit
-- FROM pg_catalog.pg_roles;
--
-- RLS och ACL är separata skydd. Enbart ny permissive policy ersätter
-- inte äldre tillåtande policyer: restriktiva policyer nedan AND-kopplas.
-- https://www.postgresql.org/docs/current/sql-createpolicy.html
-- https://www.postgresql.org/docs/current/sql-grant.html

begin;

-- Avbryt vid centrala förutsättningar som inte motsvarar förslaget.
-- Dessa kontroller ersätter inte inventeringen ovan.
do $preflight$
declare
    v_table regclass;
    v_function regprocedure;
    v_signature text;
    v_role text;
begin
    foreach v_role in array array['anon', 'authenticated'] loop
        if exists (
            select 1 from pg_catalog.pg_roles
            where rolname = v_role and (rolsuper or rolbypassrls)
        ) then
            raise exception 'Unsafe API role: % bypasses row security', v_role;
        end if;
    end loop;

    foreach v_table in array array[
        'public.workspaces'::regclass,
        'public.workspace_members'::regclass
    ] loop
        if not exists (
            select 1 from pg_catalog.pg_class
            where oid = v_table and relkind = 'r' and relrowsecurity
        ) then
            raise exception 'Review required: % must be an existing RLS-enabled table', v_table;
        end if;

        if exists (
            select 1 from pg_catalog.pg_class
            where oid = v_table
              and (pg_catalog.pg_has_role('authenticated', relowner, 'USAGE')
                   or pg_catalog.pg_has_role('anon', relowner, 'USAGE'))
        ) then
            raise exception 'Unsafe API role: effective owner of %', v_table;
        end if;

        if not pg_catalog.has_table_privilege('authenticated', v_table, 'SELECT') then
            raise exception 'Review required: authenticated SELECT missing on %', v_table;
        end if;
    end loop;

    -- RLS-kontrollerna är radbaserade; kolumnskyddet nedan förutsätter
    -- att dessa kolumner finns. Andra kolumner tillåts inte för UPDATE.
    if not exists (
        select 1 from pg_catalog.pg_attribute
        where attrelid = 'public.workspaces'::regclass
          and attname = 'created_by' and not attisdropped
    ) or not exists (
        select 1 from pg_catalog.pg_attribute
        where attrelid = 'public.workspaces'::regclass
          and attname = 'name' and not attisdropped
    ) then
        raise exception 'Review required: workspace ownership/name columns missing';
    end if;

    -- Dessa SECURITY DEFINER-funktioner måste behålla privilegier som
    -- låter dem utföra sina kontroller/skrivningar oberoende av API-rollen.
    -- Accepterar superuser/BYPASSRLS eller tabellägare utan FORCE RLS.
    foreach v_signature in array array[
        'public.get_or_create_personal_workspace()',
        'public.invite_workspace_member(uuid,text)',
        'public.remove_workspace_member(uuid,uuid)'
    ] loop
        v_function := pg_catalog.to_regprocedure(v_signature);
        if v_function is null then
            raise exception 'Required RPC missing: %', v_signature;
        end if;
        foreach v_table in array array[
            'public.workspaces'::regclass,
            'public.workspace_members'::regclass
        ] loop
            if not exists (
                select 1
                from pg_catalog.pg_proc p
                join pg_catalog.pg_roles r on r.oid = p.proowner
                join pg_catalog.pg_class c on c.oid = v_table
                where p.oid = v_function and p.prosecdef
                  and (r.rolsuper or r.rolbypassrls
                       or (c.relowner = p.proowner and not c.relforcerowsecurity))
            ) then
                raise exception 'Review SECURITY DEFINER owner/RLS: % on %', v_signature, v_table;
            end if;
        end loop;
    end loop;
end;
$preflight$;

-- =========================================================
-- API-privilegier: endast profilnamn och ägarens workspace-namn.
-- SELECT bevaras. INSERT i de två tabellerna ska gå via betrodd RPC.
-- Även TRUNCATE tas bort: TRUNCATE omfattas inte av RLS.
-- =========================================================

revoke insert, update, delete, truncate, references, trigger
on table public.workspaces, public.workspace_members
from public, anon, authenticated;

-- Tabell-REVOKE tar inte bort separata kolumnprivilegier. Rensa även
-- sådana på samtliga faktiska kolumner, inklusive eventuella extrakolumner.
do $column_privileges$
declare
    v_column record;
begin
    for v_column in
        select attrelid::regclass as table_name, attname
        from pg_catalog.pg_attribute
        where attrelid in ('public.workspaces'::regclass,
                           'public.workspace_members'::regclass)
          and attnum > 0 and not attisdropped
    loop
        execute pg_catalog.format(
            'revoke insert (%1$I), update (%1$I), references (%1$I) on table %2$s from public, anon, authenticated',
            v_column.attname, v_column.table_name
        );
    end loop;
end;
$column_privileges$;

grant update (display_name) on public.workspace_members to authenticated;
grant update (name) on public.workspaces to authenticated;
grant delete on public.workspaces to authenticated;

-- =========================================================
-- Medlemskap: egna profilnamnet får ändras, aldrig identitetskolumner.
-- Behåll gamla SELECT-policyer. Nya restriktiva policyer begränsar även
-- äldre permissive FOR ALL/UPDATE-policyer utan att gissa deras namn.
-- Direkt INSERT/DELETE stängs; inbjudan/borttagning går via RPC.
-- =========================================================

create policy "015 allow own profile update"
on public.workspace_members as permissive
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "015 restrict own profile update"
on public.workspace_members as restrictive
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "015 deny direct membership insert"
on public.workspace_members as restrictive
for insert to authenticated
with check (false);

create policy "015 deny direct membership delete"
on public.workspace_members as restrictive
for delete to authenticated
using (false);

-- =========================================================
-- Workspace: endast ägaren får byta name eller radera.
-- created_by/id/övriga kolumner saknar UPDATE-privilegier även för ägaren.
-- Skapandet görs fortfarande i get_or_create_personal_workspace().
-- =========================================================

create policy "015 allow owner workspace update"
on public.workspaces as permissive
for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy "015 restrict owner workspace update"
on public.workspaces as restrictive
for update to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

create policy "015 allow owner workspace delete"
on public.workspaces as permissive
for delete to authenticated
using (created_by = (select auth.uid()));

create policy "015 restrict owner workspace delete"
on public.workspaces as restrictive
for delete to authenticated
using (created_by = (select auth.uid()));

create policy "015 deny direct workspace insert"
on public.workspaces as restrictive
for insert to authenticated
with check (false);

-- =========================================================
-- RPC: befintliga signaturer och valideringar från 009/011 bevaras.
-- SECURITY DEFINER går normalt förbi RLS: därför krävs ägarkontroll
-- INUTI båda funktionerna, inte bara i tabellernas policyer.
-- =========================================================

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

    -- Endast workspace-ägaren får administrera medlemskap.
    if not exists (
        select 1
        from public.workspaces w
        where w.id = p_workspace_id
          and w.created_by = v_current_user_id
    ) then
        raise exception 'Only the workspace owner can invite members'
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

    -- Endast workspace-ägaren får administrera medlemskap.
    if v_owner_id is distinct from v_current_user_id then
        raise exception 'Only the workspace owner can remove members'
            using errcode = '42501';
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

-- Skapande/listning förblir tillgängligt för inloggade användare.
-- Dessa funktioners definitioner ändras inte.
revoke execute on function public.get_or_create_personal_workspace()
from public, anon;
grant execute on function public.get_or_create_personal_workspace()
to authenticated;

-- =========================================================
-- Avbryt om privilegier fortfarande ärvs från andra roller, eller om
-- funktionsägarnas rättigheter inte räcker efter REVOKE.
-- Använder effektiva privilegier, inte bara direkta ACL-poster.
-- =========================================================
do $postflight$
declare
    v_table regclass;
    v_role text;
    v_column record;
    v_signature text;
    v_owner name;
begin
    foreach v_role in array array['anon', 'authenticated'] loop
        foreach v_table in array array[
            'public.workspaces'::regclass,
            'public.workspace_members'::regclass
        ] loop
            if pg_catalog.has_any_column_privilege(v_role, v_table, 'INSERT')
               or pg_catalog.has_table_privilege(v_role, v_table, 'TRUNCATE')
               or pg_catalog.has_table_privilege(v_role, v_table, 'TRIGGER')
               or pg_catalog.has_any_column_privilege(v_role, v_table, 'REFERENCES') then
                raise exception 'Unsafe inherited write privileges: % on %', v_role, v_table;
            end if;

            if (v_role = 'anon' or v_table = 'public.workspace_members'::regclass)
               and pg_catalog.has_table_privilege(v_role, v_table, 'DELETE') then
                raise exception 'Unsafe inherited DELETE: % on %', v_role, v_table;
            end if;

            for v_column in
                select attname from pg_catalog.pg_attribute
                where attrelid = v_table and attnum > 0 and not attisdropped
            loop
                if pg_catalog.has_column_privilege(v_role, v_table, v_column.attname, 'UPDATE')
                   and not (
                       v_role = 'authenticated'
                       and ((v_table = 'public.workspaces'::regclass and v_column.attname = 'name')
                            or (v_table = 'public.workspace_members'::regclass and v_column.attname = 'display_name'))
                   ) then
                    raise exception 'Unsafe inherited UPDATE: % on %.%', v_role, v_table, v_column.attname;
                end if;
            end loop;
        end loop;
    end loop;

    foreach v_signature in array array[
        'public.get_or_create_personal_workspace()',
        'public.invite_workspace_member(uuid,text)',
        'public.remove_workspace_member(uuid,uuid)'
    ] loop
        select r.rolname into v_owner
        from pg_catalog.pg_proc p
        join pg_catalog.pg_roles r on r.oid = p.proowner
        where p.oid = pg_catalog.to_regprocedure(v_signature);

        foreach v_table in array array[
            'public.workspaces'::regclass,
            'public.workspace_members'::regclass
        ] loop
            if not pg_catalog.has_table_privilege(v_owner, v_table, 'SELECT') then
                raise exception 'RPC owner lacks SELECT: % on %', v_signature, v_table;
            end if;
        end loop;

        if v_signature = 'public.get_or_create_personal_workspace()'
           and (not pg_catalog.has_table_privilege(v_owner, 'public.workspaces', 'INSERT')
                or not pg_catalog.has_table_privilege(v_owner, 'public.workspace_members', 'INSERT')) then
            raise exception 'Personal workspace RPC owner lacks INSERT';
        elsif v_signature = 'public.invite_workspace_member(uuid,text)'
           and not pg_catalog.has_table_privilege(v_owner, 'public.workspace_members', 'INSERT') then
            raise exception 'Invite RPC owner lacks INSERT';
        elsif v_signature = 'public.remove_workspace_member(uuid,uuid)'
           and not pg_catalog.has_table_privilege(v_owner, 'public.workspace_members', 'DELETE') then
            raise exception 'Remove RPC owner lacks DELETE';
        end if;

        if not pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE')
           or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE') then
            raise exception 'Unexpected RPC EXECUTE privileges: %', v_signature;
        end if;
    end loop;
end;
$postflight$;

commit;

-- =========================================================
-- FÖRSLAG TILL VERIFIERING (inte körd)
-- =========================================================
-- A. Använd ett separat Supabase-testprojekt med samma schema, INGEN
--    kopierad träningsdata. Skapa syntetiska Auth-konton A (ägare),
--    B (inbjuden medlem), C (utanför) och D (inbjudningsmål).
--    Kör migrationen först efter inventering av verkliga definitioner.
-- B. Låt A/B/C skapa egna personliga workspaces via befintlig RPC.
--    Upprepa anropet: samma personliga workspace ska återanvändas.
--    A bjuder in B. B:s personliga workspace ska fortfarande vara B:s.
-- C. Använd respektive användares JWT via Data API/RPC. Testa INTE
--    åtkomst som postgres/service_role: dessa kan gå förbi RLS.
--    Skicka aldrig JWT eller nycklar till terminal-/testrapporter.
--
-- Testmatris (direkta API-anrop, inte enbart UI):
-- 1. A kan bjuda in D och ta bort D. B/C nekas båda RPC:erna.
-- 2. Ägaren kan inte tas bort. Okänd e-post, tom/null parameter,
--    dubblett och självinbjudan ger fortsatt fel enligt gamla RPC:er.
-- 3. A/B kan ändra eget display_name; ingen får ändra annans namn.
--    A/B/C nekas UPDATE av workspace_id/user_id och kombinerad
--    UPDATE av display_name + identitetskolumn. Kontrollera lagrad data.
-- 4. A/B/C nekas direkt INSERT/UPSERT/DELETE av medlemsrader.
--    Inbjudan/borttagning ska gå via ägarkontrollerade RPC:er.
-- 5. A kan ändra workspace.name; B/C kan inte. Ingen API-användare
--    kan ändra created_by/id, inte ens med name i samma UPDATE.
--    Direkt INSERT i workspaces nekas; personlig RPC fungerar ändå.
-- 6. A och B kan skapa/redigera upplägg, spara pass inklusive extra
--    övningar, läsa historik/PB/statistik och ändra vecko-/styrkemål.
--    Om historik redigeras direkt ska befintlig tränings-RLS gälla.
--    C får ingen åtkomst. Endast markerade övningar sparas i historiken.
-- 7. På ETT EXTRA syntetiskt workspace: B/C:s DELETE påverkar 0 rader
--    eller ger behörighetsfel. A:s DELETE påverkar exakt 1 rad.
--    Kontrollera CASCADE/restriktioner ENDAST med syntetisk träningsdata.
-- 8. Upprepa i UI efter eget -> delat -> eget workspace samt profilbyte.
--
-- För varje nekat UPDATE/DELETE: kontrollera faktisk rad och affected
-- row count. RLS kan ge 0 rader utan HTTP-fel. Förväntat fel räcker inte
-- som bevis; efterkontrollera att inga värden/medlemskap ändrades.
--
-- För SQL-baserade tester i TESTPROJEKT: BEGIN + SET LOCAL ROLE
-- authenticated och rätt request.jwt.claims för varje syntetisk user.
-- Använd SAVEPOINT runt avsiktligt felande anrop och avsluta ROLLBACK.
-- Supabase HTTP-anrop är separata transaktioner och omfattas INTE av
-- en separat SQL-editors ROLLBACK. Inga skrivtester i produktionsdata.
-- Migrationen är inte idempotent: policy-namnen ska upptäcka dubbel
-- applicering. Vid fel: ROLLBACK och granska, försök inte fortsätta.
