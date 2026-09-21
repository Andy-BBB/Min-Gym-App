-- =========================================================
-- STATISTIKMÅL
-- Lagrar endast användarvalda mål. All statistik beräknas från historiken.
-- =========================================================

create table if not exists public.exercise_strength_goals (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null
        references public.workspaces(id) on delete cascade,
    exercise_id uuid not null
        references public.exercise_library(id) on delete cascade,
    target_weight_kg numeric(8, 2) not null
        check (target_weight_kg > 0),
    target_reps integer not null
        check (target_reps between 1 and 1000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (workspace_id, exercise_id)
);

create table if not exists public.workspace_training_settings (
    workspace_id uuid primary key
        references public.workspaces(id) on delete cascade,
    weekly_session_goal integer not null default 3
        check (weekly_session_goal between 1 and 14),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.exercise_strength_goals enable row level security;
alter table public.workspace_training_settings enable row level security;

drop policy if exists "Members can manage strength goals"
on public.exercise_strength_goals;

create policy "Members can manage strength goals"
on public.exercise_strength_goals
for all
to authenticated
using (
    (select public.is_workspace_member(workspace_id))
)
with check (
    (select public.is_workspace_member(workspace_id))
    and exists (
        select 1
        from public.exercise_library el
        where el.id = exercise_strength_goals.exercise_id
          and el.workspace_id = exercise_strength_goals.workspace_id
    )
);

drop policy if exists "Members can manage training settings"
on public.workspace_training_settings;

create policy "Members can manage training settings"
on public.workspace_training_settings
for all
to authenticated
using (
    (select public.is_workspace_member(workspace_id))
)
with check (
    (select public.is_workspace_member(workspace_id))
);

revoke all on table
    public.exercise_strength_goals,
    public.workspace_training_settings
from public, anon;

grant select, insert, update, delete on table
    public.exercise_strength_goals,
    public.workspace_training_settings
to authenticated;
