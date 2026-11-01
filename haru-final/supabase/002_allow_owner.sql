-- First create your login under Authentication > Users > Add user.
-- Then replace only the email below and run in SQL Editor.
-- This is a private allowlist; never grant membership from frontend code.
do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email)=lower('REPLACE_WITH_YOUR_LOGIN_EMAIL');
  if v_id is null then
    raise exception 'Create the login user first, then enter the same email in this SQL file.';
  end if;
  insert into public.haru_members(user_id) values(v_id) on conflict do nothing;
end $$;
