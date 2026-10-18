-- Run once in the dedicated Scrabblya project's SQL editor.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 80),
 email text not null unique,
 role text not null default 'user' check (role in ('admin','user')),
 avatar_path text,
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- Only the server's service role accesses this table. No client write policies.
revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2097152,
 allowed_mime_types=array['image/jpeg','image/png','image/webp'];
