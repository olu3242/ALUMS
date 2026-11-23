-- edit_community with institution lookup (directory pick / typed name), auto name, unverified creation.
do $$
declare
  v_pa uuid := tests.user('pa98@t.io', 'Platform Admin'); v_ia uuid := tests.user('ia98@t.io', 'Inst Admin');
  v_ca uuid := tests.user('ca98@t.io', 'Class Admin');
  v_known uuid := tests.institution('Known Polytechnic');
  v_c uuid := tests.community('Look 07'); v_d uuid := tests.community('Look 09'); v_k uuid := tests.community('Known 07', 'active', v_known);
  v_dir bigint; v_new uuid;
begin
  insert into public.institution_directory (name, country, source) values ('Lookup University of Ibadan', 'Nigeria', 'curated') returning id into v_dir;
  perform tests.role(v_pa, 'platform_admin', 'platform');
  perform tests.role(v_ia, 'institution_admin', 'institution', v_known);
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);

  perform tests.login(v_pa);
  -- directory pick: official name wins over typed text; institution created unverified with the directory link
  perform public.edit_community(v_c, null, 'Accounting', 2007, null, true, 'lookup uni (typo)', v_dir);
  select institution_id into v_new from public.class_communities where id = v_c;
  perform tests.ok((select name = 'Lookup University of Ibadan' and status = 'unverified' and directory_id = v_dir and country = 'Nigeria'
    from public.institutions where id = v_new), 'directory pick creates an unverified institution with the official name');
  perform tests.ok((select name = 'Accounting — Class of 2007' from public.class_communities where id = v_c), 'blank name defaults to "<Dept> — Class of <Year>"');
  -- same directory entry again: reused, no duplicate
  perform public.edit_community(v_d, 'Law — Class of 2009', 'Law', 2009, null, true, null, v_dir);
  perform tests.ok((select institution_id = v_new from public.class_communities where id = v_d), 'existing institution reused for the same directory entry');
  perform tests.ok((select count(*) = 1 from public.institutions where directory_id = v_dir), 'no duplicate institution');
  -- typed name matching an existing institution (case-insensitive) is reused
  perform public.edit_community(v_d, 'Law — Class of 2009', 'Law', 2009, null, true, 'KNOWN POLYTECHNIC');
  perform tests.ok((select institution_id = v_known from public.class_communities where id = v_d), 'typed name reuses the existing institution');
  -- duplicate institution + department + year refused
  perform tests.throws(format('select public.edit_community(%L, null, %L, 2007, null, true, null, %s)', v_k, 'accounting', v_dir),
    'second class for same institution/department/year refused', 'P0001');
  -- clearing the lookup detaches the institution
  perform public.edit_community(v_d, 'Law — Class of 2009', 'Law', 2009, null, true, '');
  perform tests.ok((select institution_id is null from public.class_communities where id = v_d), 'empty lookup detaches the institution');
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'institution.created' and target_id = v_new
    and metadata ->> 'source' = 'community_edit'), 'lookup-created institution audited');

  -- institution admins keep their institution; they cannot move a class or add institutions
  perform tests.login(v_ia);
  perform public.edit_community(v_k, null, 'Accounting', 2008, null, true, 'Known Polytechnic');
  perform tests.ok((select graduation_year = 2008 and institution_id = v_known from public.class_communities where id = v_k), 'institution admin edits own class (same institution)');
  perform tests.throws(format('select public.edit_community(%L, null, %L, 2008, null, true, %L)', v_k, 'Accounting', 'Brand New College'),
    'institution admin cannot add institutions', '42501');
  perform tests.throws(format('select public.edit_community(%L, null, %L, 2008, null, true, null, %s)', v_k, 'Accounting', v_dir),
    'institution admin cannot move a class to another institution', '42501');
  perform tests.logout();

  perform tests.login(v_ca);
  perform tests.throws(format('select public.edit_community(%L, null, %L, 2007)', v_c, 'Accounting'), 'class admin cannot edit class identity', '42501');
  perform tests.logout();
end $$;
