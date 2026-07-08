create extension if not exists pgcrypto;

create table if not exists public.collab_rooms (
  id uuid primary key default gen_random_uuid(),
  room_public_id text not null unique,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  expires_at timestamptz not null,
  latest_snapshot_version integer not null default 0 check (latest_snapshot_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collab_room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.collab_rooms(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  code_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (room_id, role)
);

create table if not exists public.collab_room_snapshots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.collab_rooms(id) on delete cascade,
  version integer not null check (version > 0),
  encrypted_payload text not null,
  payload_hash text not null,
  app_version text not null,
  collab_protocol_version integer not null default 1 check (collab_protocol_version > 0),
  created_at timestamptz not null default now(),
  unique (room_id, version)
);

create table if not exists public.collab_room_comments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.collab_rooms(id) on delete cascade,
  slide_id text not null,
  block_id text,
  encrypted_payload text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collab_rooms_public_id_idx
  on public.collab_rooms (room_public_id);

create index if not exists collab_rooms_status_expires_idx
  on public.collab_rooms (status, expires_at);

create index if not exists collab_room_invites_room_role_idx
  on public.collab_room_invites (room_id, role);

create index if not exists collab_room_snapshots_room_version_idx
  on public.collab_room_snapshots (room_id, version desc);

create index if not exists collab_room_comments_room_status_idx
  on public.collab_room_comments (room_id, status, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

drop trigger if exists collab_rooms_touch_updated_at on public.collab_rooms;
create trigger collab_rooms_touch_updated_at
before update on public.collab_rooms
for each row execute function public.touch_updated_at();

drop trigger if exists collab_room_comments_touch_updated_at on public.collab_room_comments;
create trigger collab_room_comments_touch_updated_at
before update on public.collab_room_comments
for each row execute function public.touch_updated_at();

alter table public.collab_rooms enable row level security;
alter table public.collab_room_invites enable row level security;
alter table public.collab_room_snapshots enable row level security;
alter table public.collab_room_comments enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant execute on function public.is_active_collab_room(uuid) to anon, authenticated;
grant select on public.collab_room_snapshots to anon, authenticated;
grant select on public.collab_room_comments to anon, authenticated;
grant all on public.collab_rooms to service_role;
grant all on public.collab_room_invites to service_role;
grant all on public.collab_room_snapshots to service_role;
grant all on public.collab_room_comments to service_role;

drop policy if exists "No direct room access" on public.collab_rooms;
drop policy if exists "No direct invite access" on public.collab_room_invites;
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
