-- Server-only OAuth credentials. Run after 001_haru.sql. No browser access.
begin;
create table if not exists public.haru_google_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 encrypted_refresh text not null,
 client_id text not null,
 scopes text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.haru_google_oauth_states (
 state_hash text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 enable_tasks boolean not null default false
);
alter table public.haru_google_connections enable row level security;
alter table public.haru_google_oauth_states enable row level security;
revoke all on public.haru_google_connections,public.haru_google_oauth_states from public,anon,authenticated;
grant all on public.haru_google_connections,public.haru_google_oauth_states to service_role;
commit;
