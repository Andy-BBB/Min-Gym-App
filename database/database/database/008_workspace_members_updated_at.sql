alter table public.workspace_members
add column if not exists updated_at timestamptz
not null default now();