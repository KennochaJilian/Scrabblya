-- Scrabblya online games. Execute once after 001_profiles.sql.
create table if not exists public.games (
 id uuid primary key,
 inviter_id uuid not null references public.profiles(id),
 invitee_id uuid not null references public.profiles(id),
 status text not null default 'pending' check (status in ('pending','active','declined','finished')),
 revision integer not null default 0 check (revision >= 0),
 state jsonb not null,
 last_action_id uuid,
 last_action_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (inviter_id <> invitee_id)
);
create index if not exists games_inviter_updated on public.games(inviter_id,updated_at desc);
create index if not exists games_invitee_updated on public.games(invitee_id,updated_at desc);
create unique index if not exists games_pending_pair on public.games
 (least(inviter_id,invitee_id),greatest(inviter_id,invitee_id)) where status='pending';
alter table public.games enable row level security;
-- The API checks membership and removes hidden letters before responding.
revoke all on public.games from public, anon, authenticated;
grant select,insert,update,delete on public.games to service_role;
