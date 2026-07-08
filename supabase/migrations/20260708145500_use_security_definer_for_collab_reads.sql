create or replace function public.is_active_collab_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.collab_rooms r
    where r.id = target_room_id
      and r.status = 'active'
      and r.expires_at > now()
  );
$$;

grant execute on function public.is_active_collab_room(uuid) to anon, authenticated;

drop policy if exists "Read encrypted snapshots" on public.collab_room_snapshots;
drop policy if exists "Read encrypted comments" on public.collab_room_comments;

create policy "Read encrypted snapshots"
on public.collab_room_snapshots
for select
to anon, authenticated
using (public.is_active_collab_room(room_id));

create policy "Read encrypted comments"
on public.collab_room_comments
for select
to anon, authenticated
using (public.is_active_collab_room(room_id));
