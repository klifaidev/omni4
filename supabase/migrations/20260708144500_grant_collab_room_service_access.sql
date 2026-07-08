grant usage on schema public to anon, authenticated, service_role;
grant select on public.collab_room_snapshots to anon, authenticated;
grant select on public.collab_room_comments to anon, authenticated;
grant all on public.collab_rooms to service_role;
grant all on public.collab_room_invites to service_role;
grant all on public.collab_room_snapshots to service_role;
grant all on public.collab_room_comments to service_role;
