-- Privilege escalation, independent approvals, separation of duties, MFA, audit immutability.
do $$
declare
  v_c uuid := tests.community('Esc C');
  v_pa uuid := tests.user('pa@t.io', 'Platform Admin');
  v_pa2 uuid := tests.user('pa2@t.io', 'Platform Admin 2');
  v_ca uuid := tests.user('ca@t.io', 'Class Admin');
  v_sec uuid := tests.user('sec2@t.io', 'Secretary');
  v_m uuid := tests.user('m@t.io', 'Member');
  v_m2 uuid := tests.user('m2@t.io', 'Member Two');
  v_out uuid := tests.user('out@t.io', 'Outsider');
  v_res jsonb; v_res2 jsonb; v_appr uuid; v_ra uuid;
begin
  perform tests.role(v_pa, 'platform_admin', 'platform'); perform tests.role(v_pa2, 'platform_admin', 'platform');
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_sec); perform tests.role(v_sec, 'class_secretary', 'community', v_c);
  perform tests.member(v_c, v_m); perform tests.member(v_c, v_m2);

  -- Direct table writes are impossible for everyone
  perform tests.login(v_m);
  perform tests.throws(format('insert into public.role_assignments (user_id, role_key, scope_type, scope_id, status) values (%L, %L, %L, %L, %L)',
    v_m, 'class_admin', 'community', v_c, 'active'), 'member cannot insert role assignments', '42501');
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_m2, 'community_moderator', 'community', v_c), 'member cannot assign roles', '42501');
  perform tests.throws('update public.profiles set id = gen_random_uuid()', 'profile id is immutable', '42501');
  perform tests.throws($q$update public.businesses set status = 'approved'$q$, 'business status is not client-writable', '42501');
  perform tests.throws(format('update public.approval_requests set status = %L', 'approved'), 'approvals are not client-writable', '42501');
  perform tests.throws('delete from public.audit_logs', 'members cannot delete audit logs', '42501');
  perform tests.logout();
  perform private.audit('test.seed', 'platform', null, null, null);
  perform tests.throws('delete from public.audit_logs', 'even the owner cannot delete audit logs', '42501');
  perform tests.throws('update public.audit_logs set action = ''x.y''', 'even the owner cannot rewrite audit logs', '42501');

  -- Secretary lacks role.assign; class admin bounded by rank and self
  perform tests.login(v_sec);
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_m, 'community_moderator', 'community', v_c), 'secretary cannot assign roles', '42501');
  perform tests.logout();

  perform tests.login(v_ca);
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_m, 'class_admin', 'community', v_c), 'class admin cannot mint peer admins', '42501');
  perform tests.throws(format('select public.assign_role(%L, %L, %L)', v_m, 'platform_admin', 'platform'), 'class admin cannot grant platform roles', '42501');
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_ca, 'community_moderator', 'community', v_c), 'no self-assignment', '42501');
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_out, 'community_moderator', 'community', v_c), 'only verified members get community roles', 'P0001');
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_m, 'verified_member', 'community', v_c), 'implicit roles are not assignable', '42501');
  perform tests.throws(format('select public.assign_role(%L, %L, %L)', v_m, 'super_admin', 'platform'), 'super admin is bootstrap-only', '42501');
  perform tests.logout();

  perform tests.login(v_ca, 'aal1');
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_m, 'community_moderator', 'community', v_c), 'role assignment requires MFA (aal2)', '42501');
  perform tests.logout();

  perform tests.login(v_ca);
  v_res := public.assign_role(v_m, 'community_moderator', 'community', v_c, 'Helps with reports');
  perform tests.ok(v_res ->> 'status' = 'active', 'non-critical role activates immediately');
  perform tests.ok(not exists (select 1 from public.notifications where user_id = v_m), 'admins cannot read others'' notifications');
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.notifications where user_id = v_m and kind = 'role.assigned'), 'assignee notified');
  perform tests.login(v_ca);
  -- Treasurer is financial → independent approval
  v_res := public.assign_role(v_m2, 'class_treasurer', 'community', v_c);
  perform tests.ok(v_res ->> 'status' = 'pending_approval', 'financial role requires approval');
  v_appr := (v_res ->> 'approval_request_id')::uuid;
  perform tests.ok(not private.has_permission('finance.manage', 'community', v_c), 'sanity: admin lacks finance');
  perform tests.throws(format('select public.decide_approval(%L, true)', v_appr), 'requester cannot approve their own request', '42501');
  perform tests.logout();

  perform tests.login(v_m2);
  perform tests.ok(not private.can('finance.manage', v_c), 'pending role grants nothing');
  perform tests.throws(format('select public.decide_approval(%L, true)', v_appr), 'target cannot approve their own elevation', '42501');
  perform tests.logout();

  perform tests.login(v_pa);
  perform tests.ok((select count(*) from public.admin_pending_approvals()) = 1, 'independent approver sees the request');
  perform public.decide_approval(v_appr, true, 'Approved by platform');
  perform tests.logout();
  perform tests.login(v_m2);
  perform tests.ok(private.can('finance.manage', v_c), 'approved treasurer now holds finance.manage');
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'approval.approved' and actor_id = v_pa), 'approval audited');

  -- Separation of duties
  perform tests.login(v_pa);
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_m2, 'class_admin', 'community', v_c),
    'treasurer cannot also become class admin (SoD)', '42501');
  v_res2 := public.assign_role(v_sec, 'class_admin', 'community', v_c);
  perform tests.ok(v_res2 ->> 'status' = 'pending_approval', 'class admin assignment needs approval');
  perform tests.throws(format('select public.decide_approval(%L, true)', v_res2 ->> 'approval_request_id'), 'platform admin cannot self-approve', '42501');
  perform tests.logout();
  perform tests.login(v_ca);
  perform tests.throws(format('select public.decide_approval(%L, true)', v_res2 ->> 'approval_request_id'), 'peer-ranked admin cannot approve peer elevation', '42501');
  perform tests.logout();
  perform tests.login(v_pa2);
  perform public.decide_approval((v_res2 ->> 'approval_request_id')::uuid, true);
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.role_assignments where user_id = v_sec and role_key = 'class_admin' and status = 'active'),
    'second platform admin completes the approval');

  -- Roles lapse with membership
  update public.memberships set status = 'suspended' where community_id = v_c and user_id = v_m;
  perform tests.login(v_m);
  perform tests.ok(not private.can('moderation.resolve', v_c), 'suspended members lose community powers immediately');
  perform tests.logout();

  -- Revocation bounded by rank
  select id into v_ra from public.role_assignments where user_id = v_ca and role_key = 'class_admin';
  perform tests.login(v_sec);
  perform tests.throws(format('select public.revoke_role(%L)', v_ra), 'peer admin cannot revoke peer admin', '42501');
  perform tests.logout();
  perform tests.login(v_ca);
  perform public.revoke_role(v_ra, 'stepping down');
  perform tests.ok(not private.can('membership.approve', v_c), 'self-revocation removes powers');
  perform tests.logout();
end $$;
