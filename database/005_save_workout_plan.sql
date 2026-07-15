-- =========================================================
-- Skapa eller uppdatera ett komplett träningsupplägg
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
    v_exercise_id uuid;
    v_plan_exercise_id uuid;
    v_exercise_order integer := 0;
    v_set_number integer;
    v_exercise_name text;
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

    if nullif(trim(p_name), '') is null then
        raise exception 'Plan name is required';
    end if;

    if p_exercises is null
       or jsonb_typeof(p_exercises) <> 'array'
       or jsonb_array_length(p_exercises) = 0 then
        raise exception 'At least one exercise is required';
    end if;

    -- Skapa nytt upplägg eller uppdatera befintligt
    if p_plan_id is null then
        insert into public.workout_plans (
            workspace_id,
            name,
            sort_order
        )
        values (
            p_workspace_id,
            trim(p_name),
            0
        )
        returning id into v_plan_id;
    else
        update public.workout_plans
        set name = trim(p_name)
        where id = p_plan_id
          and workspace_id = p_workspace_id
        returning id into v_plan_id;

        if v_plan_id is null then
            raise exception 'Workout plan not found';
        end if;

        -- Gamla planövningar tas bort.
        -- Tillhörande plan_sets tas bort automatiskt via cascade.
        delete from public.plan_exercises
        where workout_plan_id = v_plan_id;
    end if;

    -- Skapa övningar och set i rätt ordning
    for v_exercise in
        select value
        from jsonb_array_elements(p_exercises)
    loop
        v_exercise_order := v_exercise_order + 1;
        v_exercise_name := trim(v_exercise ->> 'name');

        if nullif(v_exercise_name, '') is null then
            raise exception 'Exercise name is required';
        end if;

        -- Hämta övningen om den redan finns i biblioteket
        select id
        into v_exercise_id
        from public.exercise_library
        where workspace_id = p_workspace_id
          and lower(name) = lower(v_exercise_name)
        limit 1;

        -- Annars skapas den
        if v_exercise_id is null then
            insert into public.exercise_library (
                workspace_id,
                name
            )
            values (
                p_workspace_id,
                v_exercise_name
            )
            returning id into v_exercise_id;
        end if;

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