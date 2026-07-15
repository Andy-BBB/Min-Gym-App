-- =========================================================
-- RLS FÖR TRÄNINGSDATA
-- Alla medlemmar har full åtkomst inom sitt workspace.
-- =========================================================


-- ---------------------------------------------------------
-- Hjälpfunktion: kontrollera medlemskap utan RLS-rekursion
-- ---------------------------------------------------------

create or replace function public.is_workspace_member(
    p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = (select auth.uid())
    );
$$;

revoke execute
on function public.is_workspace_member(uuid)
from public, anon;

grant execute
on function public.is_workspace_member(uuid)
to authenticated;


-- =========================================================
-- EXERCISE LIBRARY
-- =========================================================

alter table public.exercise_library enable row level security;

drop policy if exists "Members can manage exercise library"
on public.exercise_library;

create policy "Members can manage exercise library"
on public.exercise_library
for all
to authenticated
using (
    (select public.is_workspace_member(workspace_id))
)
with check (
    (select public.is_workspace_member(workspace_id))
);


-- =========================================================
-- WORKOUT PLANS
-- =========================================================

alter table public.workout_plans enable row level security;

drop policy if exists "Members can manage workout plans"
on public.workout_plans;

create policy "Members can manage workout plans"
on public.workout_plans
for all
to authenticated
using (
    (select public.is_workspace_member(workspace_id))
)
with check (
    (select public.is_workspace_member(workspace_id))
);


-- =========================================================
-- PLAN EXERCISES
-- =========================================================

alter table public.plan_exercises enable row level security;

drop policy if exists "Members can manage plan exercises"
on public.plan_exercises;

create policy "Members can manage plan exercises"
on public.plan_exercises
for all
to authenticated
using (
    exists (
        select 1
        from public.workout_plans wp
        where wp.id = plan_exercises.workout_plan_id
          and public.is_workspace_member(wp.workspace_id)
    )
)
with check (
    exists (
        select 1
        from public.workout_plans wp
        where wp.id = plan_exercises.workout_plan_id
          and public.is_workspace_member(wp.workspace_id)
    )
);


-- =========================================================
-- PLAN SETS
-- =========================================================

alter table public.plan_sets enable row level security;

drop policy if exists "Members can manage plan sets"
on public.plan_sets;

create policy "Members can manage plan sets"
on public.plan_sets
for all
to authenticated
using (
    exists (
        select 1
        from public.plan_exercises pe
        inner join public.workout_plans wp
            on wp.id = pe.workout_plan_id
        where pe.id = plan_sets.plan_exercise_id
          and public.is_workspace_member(wp.workspace_id)
    )
)
with check (
    exists (
        select 1
        from public.plan_exercises pe
        inner join public.workout_plans wp
            on wp.id = pe.workout_plan_id
        where pe.id = plan_sets.plan_exercise_id
          and public.is_workspace_member(wp.workspace_id)
    )
);


-- =========================================================
-- WORKOUT SESSIONS
-- =========================================================

alter table public.workout_sessions enable row level security;

drop policy if exists "Members can manage workout sessions"
on public.workout_sessions;

create policy "Members can manage workout sessions"
on public.workout_sessions
for all
to authenticated
using (
    (select public.is_workspace_member(workspace_id))
)
with check (
    (select public.is_workspace_member(workspace_id))
);


-- =========================================================
-- SESSION EXERCISES
-- =========================================================

alter table public.session_exercises enable row level security;

drop policy if exists "Members can manage session exercises"
on public.session_exercises;

create policy "Members can manage session exercises"
on public.session_exercises
for all
to authenticated
using (
    exists (
        select 1
        from public.workout_sessions ws
        where ws.id = session_exercises.workout_session_id
          and public.is_workspace_member(ws.workspace_id)
    )
)
with check (
    exists (
        select 1
        from public.workout_sessions ws
        where ws.id = session_exercises.workout_session_id
          and public.is_workspace_member(ws.workspace_id)
    )
);


-- =========================================================
-- SESSION SETS
-- =========================================================

alter table public.session_sets enable row level security;

drop policy if exists "Members can manage session sets"
on public.session_sets;

create policy "Members can manage session sets"
on public.session_sets
for all
to authenticated
using (
    exists (
        select 1
        from public.session_exercises se
        inner join public.workout_sessions ws
            on ws.id = se.workout_session_id
        where se.id = session_sets.session_exercise_id
          and public.is_workspace_member(ws.workspace_id)
    )
)
with check (
    exists (
        select 1
        from public.session_exercises se
        inner join public.workout_sessions ws
            on ws.id = se.workout_session_id
        where se.id = session_sets.session_exercise_id
          and public.is_workspace_member(ws.workspace_id)
    )
);


-- =========================================================
-- DATA API-BEHÖRIGHETER
-- =========================================================

revoke all on table
    public.exercise_library,
    public.workout_plans,
    public.plan_exercises,
    public.plan_sets,
    public.workout_sessions,
    public.session_exercises,
    public.session_sets
from anon;

grant select, insert, update, delete on table
    public.exercise_library,
    public.workout_plans,
    public.plan_exercises,
    public.plan_sets,
    public.workout_sessions,
    public.session_exercises,
    public.session_sets
to authenticated;