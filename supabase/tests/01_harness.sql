-- Test helpers: impersonate users, assert outcomes.
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.user(p_email text, p_name text default null, p_confirmed boolean default true) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into auth.users (email, raw_user_meta_data, email_confirmed_at)
  values (p_email, jsonb_build_object('full_name', coalesce(p_name, split_part(p_email, '@', 1))), case when p_confirmed then now() end)
  returning id into v;
  return v;
end $$;

create function tests.login(p_uid uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, false);
  execute 'set role authenticated';
end $$;

create function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  execute 'set role anon';
end $$;

create function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;

create function tests.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- Expects the statement to raise; optionally match SQLSTATE.
create function tests.throws(p_sql text, p_msg text, p_state text default null) returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if p_state is not null and v_state <> p_state then
      raise exception 'FAIL: % (expected SQLSTATE %, got % — %)', p_msg, p_state, v_state, sqlerrm;
    end if;
    raise notice 'PASS: % [%]', p_msg, v_state;
    return;
  end;
  raise exception 'FAIL: % (statement succeeded)', p_msg;
end $$;

create function tests.count(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin execute 'select count(*) from (' || p_sql || ') q' into v; return v; end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- Fixtures (run as the database owner, before impersonating).
create function tests.community(p_name text, p_status public.community_status default 'active', p_institution uuid default null)
returns uuid language sql as $$
  insert into public.class_communities (slug, name, department_name, graduation_year, status, institution_id)
  values (private.slugify(p_name) || '-' || substr(md5(random()::text), 1, 6), p_name, 'Dept ' || p_name, 2007, p_status, p_institution)
  returning id
$$;
create function tests.member(p_community uuid, p_user uuid) returns uuid language sql as $$
  insert into public.memberships (community_id, user_id, verification_method) values (p_community, p_user, 'bootstrap') returning id
$$;
create function tests.role(p_user uuid, p_role text, p_scope_type public.scope_type, p_scope uuid default null) returns uuid
language sql as $$
  insert into public.role_assignments (user_id, role_key, scope_type, scope_id, status, activated_at)
  values (p_user, p_role, p_scope_type, p_scope, 'active', now()) returning id
$$;
create function tests.institution(p_name text) returns uuid language sql as $$
  insert into public.institutions (name, slug, status) values (p_name, private.slugify(p_name), 'verified') returning id
$$;
