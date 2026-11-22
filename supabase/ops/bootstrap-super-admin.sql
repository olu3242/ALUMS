-- Run ONCE per environment as the database owner (Supabase SQL editor or psql), after the user has signed up
-- and confirmed their email. Super Admin cannot be granted through the app (rank 100, not assignable).
-- psql usage: psql "$DB_URL" -v email="'founder@example.com'" -f supabase/ops/bootstrap-super-admin.sql
do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(:email) and email_confirmed_at is not null;
  if v_uid is null then raise exception 'no confirmed user with that email'; end if;
  insert into public.role_assignments (user_id, role_key, scope_type, scope_id, status, reason, activated_at)
  values (v_uid, 'super_admin', 'platform', null, 'active', 'environment bootstrap', now())
  on conflict do nothing;
  insert into public.audit_logs (actor_id, action, scope_type, target_type, target_id, metadata)
  values (null, 'role.bootstrapped', 'platform', 'user', v_uid, jsonb_build_object('role', 'super_admin'));
end $$;
