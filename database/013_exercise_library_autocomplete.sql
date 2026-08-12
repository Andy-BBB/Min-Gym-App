-- =========================================================
-- Övningsbank, stabila exercise_id och autocomplete-stöd
-- =========================================================

begin;

-- Koppla äldre extraövningar till en befintlig biblioteksövning när
-- namn och workspace ger en entydig, exakt matchning.
update public.session_exercises se
set exercise_id = el.id
from public.workout_sessions ws,
     public.exercise_library el
where ws.id = se.workout_session_id
  and se.exercise_id is null
  and el.workspace_id = ws.workspace_id
  and pg_catalog.lower(pg_catalog.btrim(el.name)) =
      pg_catalog.lower(pg_catalog.btrim(se.exercise_name_snapshot));

do $$
begin
    if exists (
        select 1
        from public.session_exercises
        where exercise_id is null
    ) then
        raise exception
            'Migration avbruten: session_exercises innehåller fortfarande exercise_id = null';
    end if;

    if exists (
        select 1
        from public.exercise_library
        group by
            workspace_id,
            pg_catalog.lower(
                pg_catalog.regexp_replace(
                    pg_catalog.btrim(name),
                    '\s+',
                    '',
                    'g'
                )
            )
        having count(*) > 1
    ) then
        raise exception
            'Migration avbruten: övningsbanken innehåller normaliserade dubbletter';
    end if;
end;
$$;

-- Det befintliga indexet stoppar skillnader i skiftläge. Detta index
-- stoppar även varianter som "Bänkpress" och "Bänk press".
create unique index if not exists
exercise_library_workspace_normalized_name_unique
on public.exercise_library (
    workspace_id,
    pg_catalog.lower(
        pg_catalog.regexp_replace(
            pg_catalog.btrim(name),
            '\s+',
            '',
            'g'
        )
    )
);

-- Intern hjälpfunktion. Den validerar ett valt exercise_id eller
-- återanvänder/skapar en övning från dess normaliserade namn.
create or replace function public.resolve_workspace_exercise(
    p_workspace_id uuid,
    p_exercise_id uuid,
    p_name text,
    p_create_new boolean
)
returns table (
    exercise_id uuid,
    exercise_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_exercise_id uuid;
    v_exercise_name text;
    v_clean_name text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_workspace_member(p_workspace_id) then
        raise exception 'Workspace access denied'
            using errcode = '42501';
    end if;

    v_clean_name := pg_catalog.btrim(p_name);

    if p_exercise_id is not null then
        select el.id, el.name
        into v_exercise_id, v_exercise_name
        from public.exercise_library el
        where el.id = p_exercise_id
          and el.workspace_id = p_workspace_id
        limit 1;

        if v_exercise_id is null then
            raise exception 'Selected exercise does not belong to the active workspace';
        end if;

        return query
        select v_exercise_id, v_exercise_name;
        return;
    end if;

    if nullif(v_clean_name, '') is null then
        raise exception 'Exercise name is required';
    end if;

    select el.id, el.name
    into v_exercise_id, v_exercise_name
    from public.exercise_library el
    where el.workspace_id = p_workspace_id
      and pg_catalog.lower(
          pg_catalog.regexp_replace(
              pg_catalog.btrim(el.name),
              '\s+',
              '',
              'g'
          )
      ) = pg_catalog.lower(
          pg_catalog.regexp_replace(
              v_clean_name,
              '\s+',
              '',
              'g'
          )
      )
    limit 1;

    if v_exercise_id is null and not coalesce(p_create_new, false) then
        raise exception 'Select an existing exercise or confirm creation of a new exercise';
    end if;

    if v_exercise_id is null then
        insert into public.exercise_library (
            workspace_id,
            name
        )
        values (
            p_workspace_id,
            v_clean_name
        )
        on conflict do nothing
        returning id, name
        into v_exercise_id, v_exercise_name;

        -- Hantera en möjlig samtidig insert utan att skapa dubblett.
        if v_exercise_id is null then
            select el.id, el.name
            into v_exercise_id, v_exercise_name
            from public.exercise_library el
            where el.workspace_id = p_workspace_id
              and pg_catalog.lower(
                  pg_catalog.regexp_replace(
                      pg_catalog.btrim(el.name),
                      '\s+',
                      '',
                      'g'
                  )
              ) = pg_catalog.lower(
                  pg_catalog.regexp_replace(
                      v_clean_name,
                      '\s+',
                      '',
                      'g'
                  )
              )
            limit 1;
        end if;
    end if;

    return query
    select v_exercise_id, v_exercise_name;
end;
$$;

revoke all
on function public.resolve_workspace_exercise(uuid, uuid, text, boolean)
from public, anon, authenticated;

-- =========================================================
-- Spara eller uppdatera träningsupplägg med exerciseId
-- =========================================================

create or replace function public.save_workout_plan(
    p_workspace_id uuid,
    p_plan_id uuid,
    p_name text,
    p_exercises jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_plan_id uuid;
    v_exercise jsonb;
    v_set jsonb;
    v_requested_exercise_id uuid;
    v_exercise_id uuid;
    v_plan_exercise_id uuid;
    v_exercise_order integer := 0;
    v_set_number integer;
    v_exercise_name text;
    v_create_new boolean;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_workspace_member(p_workspace_id) then
        raise exception 'Workspace access denied'
            using errcode = '42501';
    end if;

    if nullif(pg_catalog.btrim(p_name), '') is null then
        raise exception 'Plan name is required';
    end if;

    if p_exercises is null
       or jsonb_typeof(p_exercises) <> 'array'
       or jsonb_array_length(p_exercises) = 0 then
        raise exception 'At least one exercise is required';
    end if;

    if p_plan_id is null then
        insert into public.workout_plans (
            workspace_id,
            name,
            sort_order
        )
        values (
            p_workspace_id,
            pg_catalog.btrim(p_name),
            0
        )
        returning id into v_plan_id;
    else
        update public.workout_plans
        set name = pg_catalog.btrim(p_name)
        where id = p_plan_id
          and workspace_id = p_workspace_id
        returning id into v_plan_id;

        if v_plan_id is null then
            raise exception 'Workout plan not found';
        end if;

        delete from public.plan_exercises
        where workout_plan_id = v_plan_id;
    end if;

    for v_exercise in
        select value
        from jsonb_array_elements(p_exercises)
    loop
        v_exercise_order := v_exercise_order + 1;
        v_requested_exercise_id := null;

        if nullif(v_exercise ->> 'exerciseId', '') is not null then
            begin
                v_requested_exercise_id :=
                    (v_exercise ->> 'exerciseId')::uuid;
            exception
                when invalid_text_representation then
                    raise exception 'Invalid exerciseId';
            end;
        end if;

        -- Äldre frontendversioner saknar createNew. De behåller tidigare
        -- beteende tills alla installerade PWA-klienter har uppdaterats.
        v_create_new := case
            when v_exercise ? 'createNew'
                then coalesce((v_exercise ->> 'createNew')::boolean, false)
            else true
        end;

        select resolved.exercise_id, resolved.exercise_name
        into v_exercise_id, v_exercise_name
        from public.resolve_workspace_exercise(
            p_workspace_id,
            v_requested_exercise_id,
            v_exercise ->> 'name',
            v_create_new
        ) resolved;

        insert into public.plan_exercises (
            workout_plan_id,
            exercise_id,
            sort_order
        )
        values (
            v_plan_id,
            v_exercise_id,
            v_exercise_order
        )
        returning id into v_plan_exercise_id;

        v_set_number := 0;

        for v_set in
            select value
            from jsonb_array_elements(
                coalesce(v_exercise -> 'sets', '[]'::jsonb)
            )
        loop
            v_set_number := v_set_number + 1;

            insert into public.plan_sets (
                plan_exercise_id,
                set_number,
                target_weight_kg,
                target_reps
            )
            values (
                v_plan_exercise_id,
                v_set_number,
                coalesce((v_set ->> 'weight')::numeric, 0),
                coalesce((v_set ->> 'reps')::integer, 0)
            );
        end loop;

        if v_set_number = 0 then
            raise exception 'Every exercise must contain at least one set';
        end if;
    end loop;

    return v_plan_id;
end;
$$;

revoke execute
on function public.save_workout_plan(uuid, uuid, text, jsonb)
from public, anon;

grant execute
on function public.save_workout_plan(uuid, uuid, text, jsonb)
to authenticated;

-- =========================================================
-- Spara träningspass med exerciseId även för extraövningar
-- =========================================================

create or replace function public.save_workout_session(
    p_workspace_id uuid,
    p_workout_plan_id uuid,
    p_plan_name text,
    p_started_at timestamptz,
    p_exercises jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid;
    v_session_id uuid;
    v_session_exercise_id uuid;
    v_exercise jsonb;
    v_set jsonb;
    v_source_plan_exercise_id uuid;
    v_plan_library_id uuid;
    v_requested_exercise_id uuid;
    v_exercise_id uuid;
    v_exercise_name text;
    v_exercise_order integer := 0;
    v_set_number integer;
    v_create_new boolean;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '42501';
    end if;

    if not public.is_workspace_member(p_workspace_id) then
        raise exception 'Workspace access denied'
            using errcode = '42501';
    end if;

    if p_exercises is null
       or jsonb_typeof(p_exercises) <> 'array'
       or jsonb_array_length(p_exercises) = 0 then
        raise exception 'At least one completed exercise is required';
    end if;

    insert into public.workout_sessions (
        workspace_id,
        workout_plan_id,
        performed_by,
        plan_name_snapshot,
        started_at,
        completed_at
    )
    values (
        p_workspace_id,
        p_workout_plan_id,
        v_user_id,
        nullif(pg_catalog.btrim(p_plan_name), ''),
        coalesce(p_started_at, now()),
        now()
    )
    returning id into v_session_id;

    for v_exercise in
        select value
        from jsonb_array_elements(p_exercises)
    loop
        v_exercise_order := v_exercise_order + 1;
        v_source_plan_exercise_id := null;
        v_plan_library_id := null;
        v_requested_exercise_id := null;

        if nullif(v_exercise ->> 'templateExerciseId', '') is not null then
            begin
                v_source_plan_exercise_id :=
                    (v_exercise ->> 'templateExerciseId')::uuid;
            exception
                when invalid_text_representation then
                    v_source_plan_exercise_id := null;
            end;
        end if;

        if v_source_plan_exercise_id is not null then
            select pe.exercise_id
            into v_plan_library_id
            from public.plan_exercises pe
            inner join public.workout_plans wp
                on wp.id = pe.workout_plan_id
            where pe.id = v_source_plan_exercise_id
              and wp.workspace_id = p_workspace_id
            limit 1;

            if v_plan_library_id is null then
                v_source_plan_exercise_id := null;
            end if;
        end if;

        if nullif(v_exercise ->> 'exerciseId', '') is not null then
            begin
                v_requested_exercise_id :=
                    (v_exercise ->> 'exerciseId')::uuid;
            exception
                when invalid_text_representation then
                    raise exception 'Invalid exerciseId';
            end;
        else
            v_requested_exercise_id := v_plan_library_id;
        end if;

        v_create_new := case
            when v_exercise ? 'createNew'
                then coalesce((v_exercise ->> 'createNew')::boolean, false)
            else true
        end;

        select resolved.exercise_id, resolved.exercise_name
        into v_exercise_id, v_exercise_name
        from public.resolve_workspace_exercise(
            p_workspace_id,
            v_requested_exercise_id,
            v_exercise ->> 'name',
            v_create_new
        ) resolved;

        if v_plan_library_id is distinct from v_exercise_id then
            v_source_plan_exercise_id := null;
        end if;

        insert into public.session_exercises (
            workout_session_id,
            exercise_id,
            source_plan_exercise_id,
            exercise_name_snapshot,
            sort_order
        )
        values (
            v_session_id,
            v_exercise_id,
            v_source_plan_exercise_id,
            v_exercise_name,
            v_exercise_order
        )
        returning id into v_session_exercise_id;

        v_set_number := 0;

        for v_set in
            select value
            from jsonb_array_elements(
                coalesce(v_exercise -> 'sets', '[]'::jsonb)
            )
        loop
            v_set_number := v_set_number + 1;

            insert into public.session_sets (
                session_exercise_id,
                set_number,
                weight_kg,
                reps
            )
            values (
                v_session_exercise_id,
                v_set_number,
                coalesce((v_set ->> 'weight')::numeric, 0),
                coalesce((v_set ->> 'reps')::integer, 0)
            );
        end loop;

        if v_set_number = 0 then
            raise exception
                'Every completed exercise must contain at least one set';
        end if;
    end loop;

    return v_session_id;
end;
$$;

revoke execute
on function public.save_workout_session(
    uuid,
    uuid,
    text,
    timestamptz,
    jsonb
)
from public, anon;

grant execute
on function public.save_workout_session(
    uuid,
    uuid,
    text,
    timestamptz,
    jsonb
)
to authenticated;

commit;
