create policy "Users can update their own workspace profile"
on public.workspace_members
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);

grant update on table public.workspace_members
to authenticated;