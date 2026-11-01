-- Run once in the project's SQL Editor. Additive; does not delete application data.
-- Reads use RLS. Writes go through an authenticated, version-checked RPC only.
begin;
create table if not exists public.haru_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.haru_members enable row level security;
drop policy if exists haru_members_self_read on public.haru_members;
create policy haru_members_self_read on public.haru_members for select to authenticated
using (user_id = (select auth.uid()));
revoke all on public.haru_members from public, anon, authenticated;
grant select on public.haru_members to authenticated;

create table if not exists public.haru_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.haru_documents enable row level security;
drop policy if exists haru_documents_self_read on public.haru_documents;
create policy haru_documents_self_read on public.haru_documents for select to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public.haru_members m where m.user_id = (select auth.uid())
));
revoke all on public.haru_documents from public, anon, authenticated;
grant select on public.haru_documents to authenticated;

create or replace function public.haru_save_document(p_payload jsonb, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_version bigint;
  v_updated timestamptz;
  v_key text;
begin
  if v_uid is null then
    raise exception 'HARU_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.haru_members where user_id = v_uid) then
    raise exception 'HARU_ACCESS_DENIED' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'HARU_INVALID_VERSION' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'profile') is distinct from 'object'
    or octet_length(p_payload::text) > 5242880 then
    raise exception 'HARU_INVALID_DOCUMENT' using errcode = '22023';
  end if;
  foreach v_key in array array['roles','goals','tasks','notes','health','people','moments','issues',
      'investments','loans','incomes','decisions','reviews','timeLogs','focus'] loop
    if jsonb_typeof(p_payload->v_key) is distinct from 'array' then
      raise exception 'HARU_INVALID_DOCUMENT' using errcode = '22023';
    end if;
  end loop;
  if p_expected_version = 0 then
    insert into public.haru_documents (user_id,payload,version)
      values (v_uid,p_payload,1)
      on conflict (user_id) do nothing
      returning version, updated_at into v_version,v_updated;
  else
    update public.haru_documents
      set payload=p_payload,version=version+1,updated_at=clock_timestamp()
      where user_id=v_uid and version=p_expected_version
      returning version,updated_at into v_version,v_updated;
  end if;
  if v_version is null then
    raise exception 'HARU_CONFLICT' using errcode = 'P0001';
  end if;
  return jsonb_build_object('version',v_version,'updated_at',v_updated);
end;
$$;
revoke all on function public.haru_save_document(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.haru_save_document(jsonb,bigint) to authenticated;
commit;
