-- =========================================================
-- Spara ett genomfört träningspass
-- Endast genomförda övningar skickas till funktionen.
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
    v_exercise_id uuid;

    v_exercise_name text;
    v_exercise_order integer := 0;
    v_set_number integer;
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

    -- Skapa själva träningspasset
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
        nullif(trim(p_plan_name), ''),
        coalesce(p_started_at, now()),
        now()
    )
    returning id into v_session_id;

    -- Spara endast de genomförda övningar som skickats in
    for v_exercise in
        select value
        from jsonb_array_elements(p_exercises)
    loop
        v_exercise_order := v_exercise_order + 1;

        v_exercise_name :=
            trim(v_exercise ->> 'name');

        if nullif(v_exercise_name, '') is null then
            raise exception 'Exercise name is required';
        end if;

        v_source_plan_exercise_id := null;
        v_exercise_id := null;

        -- Försök koppla övningen till standardupplägget
        if nullif(
            v_exercise ->> 'templateExerciseId',
            ''
        ) is not null then
            begin
                v_source_plan_exercise_id :=
                    (v_exercise ->> 'templateExerciseId')::uuid;
            exception
                when invalid_text_representation then
                    v_source_plan_exercise_id := null;
            end;
        end if;

        -- Hämta övningsbibliotekets id via planövningen
        if v_source_plan_exercise_id is not null then
            select pe.exercise_id
            into v_exercise_id
            from public.plan_exercises pe
            inner join public.workout_plans wp
                on wp.id = pe.workout_plan_id
            where pe.id = v_source_plan_exercise_id
              and wp.workspace_id = p_workspace_id
            limit 1;

            -- Ogiltig koppling sparas inte
            if v_exercise_id is null then
                v_source_plan_exercise_id := null;
            end if;
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
                coalesce(
                    v_exercise -> 'sets',
                    '[]'::jsonb
                )
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
                coalesce(
                    (v_set ->> 'weight')::numeric,
                    0
                ),
                coalesce(
                    (v_set ->> 'reps')::integer,
                    0
                )
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