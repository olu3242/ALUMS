do $$
declare v_missing text; v_founding uuid; v_alice uuid := tests.user('alice@t.io', 'Alice'); v_c uuid := tests.community('Hidden', 'pending_verification');
begin
  select string_agg(tablename, ', ') into v_missing from pg_tables where schemaname = 'public' and not rowsecurity;
  perform tests.ok(v_missing is null, 'RLS enabled on every public table (' || coalesce(v_missing, 'none missing') || ')');

  select string_agg(p.proname, ', ') into v_missing from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  perform tests.ok(v_missing is null, 'every SECURITY DEFINER function pins search_path (' || coalesce(v_missing, 'ok') || ')');

  select string_agg(p.proname, ', ') into v_missing from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('search_communities', 'search_institution_directory', 'institution_directory_countries');
  perform tests.ok(v_missing is null, 'anon can execute only public lookup RPCs (' || coalesce(v_missing, 'ok') || ')');

  perform tests.ok(not has_function_privilege('authenticated', 'private.audit(text, public.scope_type, uuid, text, uuid, jsonb)', 'execute'),
    'authenticated cannot call private.audit directly');

  perform tests.anon();
  perform tests.ok((select count(*) from public.class_communities where id = v_c) = 0, 'anon cannot see pending communities');
  perform tests.ok((select count(*) from public.class_communities where is_founding) = 1, 'anon sees the founding community');
  perform tests.ok((select count(*) from public.search_communities(null, 'accounting', 2007)) = 1, 'search finds Accounting 2007');
  perform tests.ok((select institution_name from public.search_communities(null, 'accounting', 2007)) is null,
    'founding community shows no invented institution');
  perform tests.throws('select created_by from public.class_communities', 'anon cannot read internal community columns', '42501');
  perform tests.throws('select * from public.memberships', 'anon cannot read memberships', '42501');
  perform tests.throws('select * from public.profiles', 'anon cannot read profiles', '42501');
  perform tests.throws('select * from public.audit_logs', 'anon cannot read audit logs', '42501');
  perform tests.throws($q$select public.apply_for_membership(gen_random_uuid(), 'x')$q$, 'anon cannot call member RPCs', '42501');
  perform tests.logout();

  perform tests.login(v_alice);
  perform tests.ok((select count(*) from public.profiles) = 1, 'a user reads only their own profile row');
  perform tests.ok((select count(*) from public.search_communities(null, '%', null)) = 0, 'LIKE wildcards in search are literal');
  perform tests.logout();
end $$;
