-- Platform CRED: edit/delete institutions and communities, member removal, account list and suspension.
do $$
declare
  v_i uuid := tests.institution('Crud University'); v_j uuid := tests.institution('Empty Institute');
  v_c uuid := tests.community('Crud 07', 'active', v_i); v_e uuid := tests.community('Empty 08');
  v_pa uuid := tests.user('pa97@t.io', 'Platform Admin'); v_ia uuid := tests.user('ia97@t.io', 'Inst Admin');
  v_ca uuid := tests.user('ca97@t.io', 'Class Admin'); v_m uuid := tests.user('m97@t.io', 'Plain Member');
  v_mem uuid; v_camem uuid;
begin
  perform tests.role(v_pa, 'platform_admin', 'platform');
  perform tests.role(v_ia, 'institution_admin', 'institution', v_i);
  v_camem := tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  v_mem := tests.member(v_c, v_m);
  insert into auth.sessions (user_id) values (v_m);

  -- MFA gate
  perform tests.login(v_pa, 'aal1');
  perform tests.throws(format('select public.update_institution(%L, %L)', v_i, 'X Uni'), 'institution edit needs MFA', '42501');
  perform tests.logout();

  perform tests.login(v_pa);
  perform public.update_institution(v_i, 'Crud University of Lagos', 'Nigeria', 'Lagos', 'https://crud.example');
  perform tests.throws(format('select public.delete_institution(%L)', v_i), 'institution with classes cannot be deleted', 'P0001');
  perform public.delete_institution(v_j);
  perform public.edit_community(v_c, 'Crud — Class of 2008', 'Accounting', 2008);
  perform public.edit_community(v_e, 'Empty — Class of 2008', 'Finance', 2008, v_i, true);
  perform tests.throws(format('select public.edit_community(%L, %L, %L, 2008)', v_c, 'Dup', 'finance'), 'second community for same dept/year is refused', 'P0001');
  perform tests.throws(format('select public.delete_community(%L)', v_c), 'community with members cannot be deleted', 'P0001');
  perform public.delete_community(v_e);
  perform tests.ok((select count(*) from public.admin_list_users('m97@')) = 1, 'platform admin can search accounts');
  perform tests.ok((select email_confirmed and not suspended from public.admin_list_users('m97@')), 'account status fields');
  perform public.set_account_status(v_m, true, 'Spam reports');
  perform tests.ok((select suspended from public.admin_list_users('m97@')), 'account suspended');
  perform tests.throws(format('select public.set_account_status(%L, true, %L)', v_pa, 'self'), 'cannot suspend yourself', '42501');
  perform public.set_account_status(v_m, false);
  perform tests.logout();
  perform tests.ok((select name = 'Crud University of Lagos' and country = 'Nigeria' from public.institutions where id = v_i), 'institution edited');
  perform tests.ok(not exists (select 1 from public.institutions where id = v_j), 'empty institution deleted');
  perform tests.ok((select graduation_year = 2008 and department_name = 'Accounting' from public.class_communities where id = v_c), 'community edited');
  perform tests.ok(not exists (select 1 from public.class_communities where id = v_e), 'empty community deleted');
  perform tests.ok(not exists (select 1 from auth.sessions where user_id = v_m), 'suspension signs the account out everywhere');
  perform tests.ok((select banned_until is null from auth.users where id = v_m), 'reinstatement lifts the ban');
  perform tests.ok((select count(*) from public.audit_logs where action in ('institution.updated', 'institution.deleted', 'community.edited',
    'community.deleted', 'account.suspended', 'account.reinstated') and actor_id = v_pa) >= 7, 'every CRED write is audited');

  -- Institution admins: edit own classes, but cannot move them, delete classes, or touch institutions/accounts
  perform tests.login(v_ia);
  perform public.edit_community(v_c, 'Crud — Class of 2008 (Accounting)', 'Accounting', 2008);
  perform tests.throws(format('select public.edit_community(%L, %L, %L, 2008, null, true)', v_c, 'x y', 'Accounting'), 'institution admin cannot change the institution', '42501');
  perform tests.throws(format('select public.delete_community(%L)', v_c), 'institution admin cannot delete classes', '42501');
  perform tests.throws(format('select public.update_institution(%L, %L)', v_i, 'Hijack'), 'institution admin cannot edit institution identity', '42501');
  perform tests.throws('select * from public.admin_list_users()', 'institution admin cannot list all accounts', '42501');
  perform tests.logout();

  -- Class admin: remove (reversible), never list accounts or edit the class identity
  perform tests.login(v_ca, 'aal1');
  perform tests.throws(format('select public.remove_member(%L, %L)', v_mem, 'Left the class'), 'removal needs MFA', '42501');
  perform tests.logout();
  perform tests.login(v_ca);
  perform tests.throws(format('select public.remove_member(%L, %L)', v_mem, 'x'), 'removal needs a reason', '22023');
  perform public.remove_member(v_mem, 'Asked to be removed');
  perform tests.throws(format('select public.edit_community(%L, %L, %L, 2008)', v_c, 'x y', 'Accounting'), 'class admin cannot edit identity', '42501');
  perform tests.throws(format('select public.set_account_status(%L, true, %L)', v_m, 'nope'), 'class admin cannot suspend accounts', '42501');
  perform public.set_membership_status(v_mem, 'active', 'Reinstated');
  perform tests.logout();
  perform tests.ok((select status = 'active' from public.memberships where id = v_mem), 'removal is reversible');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'membership.removed' and actor_id = v_ca), 'removal audited');

  perform tests.login(v_m);
  perform tests.throws(format('select public.remove_member(%L, %L)', v_camem, 'coup attempt'), 'members cannot remove leaders', '42501');
  perform tests.logout();
  perform tests.anon();
  perform tests.throws('select * from public.admin_list_users()', 'anon cannot list accounts', '42501');
  perform tests.logout();
end $$;
