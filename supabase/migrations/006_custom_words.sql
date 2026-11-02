-- Supplemental family lexicon. Access only through the authenticated API.
create table if not exists public.custom_words (
 word text primary key check (word ~ '^[A-Z]{2,15}$'),
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.custom_words enable row level security;
revoke all on public.custom_words from public, anon, authenticated;
grant select, insert, delete on public.custom_words to service_role;
