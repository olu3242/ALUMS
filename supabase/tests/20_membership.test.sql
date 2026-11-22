-- Workflow A: register → verify email → apply → review → approve → access.
do $$
declare
  v_c uuid := tests.community('Accounting A');
  v_admin uuid := tests.user('admin@t.io', 'Ada Admin');
  v_app uuid := tests.user('applicant@t.io', 'Ben Applicant');
  v_unconf uuid := tests.user('unconfirmed@t.io', 'Una', false);
  v_req uuid; v_req2 uuid;
begin
  perform tests.member(v_c, v_admin);
  perform tests.role(v_admin, 'class_admin', 'community', v_c);

  perform tests.login(v_unconf);
  perform tests.throws(format('select public.apply_for_membership(%L, %L)', v_c, 'Una U'), 'unverified email cannot apply', '42501');
  perform tests.logout();

  perform tests.login(v_app);
  perform tests.ok(not private.is_member(v_c), 'applicant starts without access');
  perform tests.throws(format('select * from public.community_directory(%L)', v_c), 'non-member cannot read directory', '42501');
  v_req := public.apply_for_membership(v_c, 'Ben Applicant', 'ACC/07/123', 'Sat in row 3');
  perform tests.ok(v_req is not null, 'verified user can apply');
  perform tests.throws(format('select public.apply_for_membership(%L, %L)', v_c, 'Ben'), 'duplicate pending request rejected', 'P0001');
  perform tests.throws(format('select public.review_membership_request(%L, true)', v_req), 'applicant cannot approve themselves', '42501');
  perform tests.throws(format('insert into public.memberships (community_id, user_id, verification_method) values (%L, %L, %L)', v_c, v_app, 'bootstrap'),
    'direct membership insert is impossible', '42501');
  perform tests.ok((select count(*) from public.membership_requests) = 1, 'applicant sees own request');
  perform tests.logout();

  perform tests.login(v_admin, 'aal1');
  perform tests.ok((select count(*) from public.admin_membership_requests(v_c)) = 1, 'class admin sees the queue');
  perform tests.ok((select student_identifier from public.admin_membership_requests(v_c)) = 'ACC/07/123', 'reviewer sees verification evidence');
  perform public.review_membership_request(v_req, true, 'Confirmed by class list');
  perform tests.throws(format('select public.review_membership_request(%L, true)', v_req), 'request cannot be decided twice', 'P0001');
  perform tests.logout();

  perform tests.ok(exists (select 1 from public.memberships where community_id = v_c and user_id = v_app and status = 'active'
                                and verified_by = v_admin), 'approval creates a verified membership');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'membership.approved' and actor_id = v_admin and target_id = v_app),
    'approval is audited with the real actor');
  perform tests.ok(exists (select 1 from public.notifications where user_id = v_app and kind = 'membership.approved'), 'member is notified');
  perform tests.ok(exists (select 1 from public.notifications where user_id = v_admin and kind = 'membership.requested'), 'reviewer was notified of the request');

  perform tests.login(v_app);
  perform tests.ok(private.is_member(v_c), 'approved member has access');
  perform tests.ok((select count(*) from public.community_directory(v_c)) = 2, 'directory lists both verified members');
  perform tests.throws(format('select public.apply_for_membership(%L, %L)', v_c, 'Ben'), 'existing member cannot re-apply', 'P0001');
  perform public.leave_community(v_c);
  perform tests.ok(not private.is_member(v_c), 'leaving removes access');
  perform tests.logout();

  -- Suspension
  perform tests.login(v_admin);
  perform tests.throws(format('update public.memberships set status = %L where user_id = %L', 'active', v_app),
    'admins cannot write memberships directly', '42501');
  perform tests.logout();
  perform tests.ok((select status from public.memberships where community_id = v_c and user_id = v_app) = 'left', 'members table is not directly writable');

  update public.memberships set status = 'active' where community_id = v_c and user_id = v_app;
  perform tests.login(v_admin);
  perform public.set_membership_status((select id from public.memberships where community_id = v_c and user_id = v_app), 'suspended', 'test');
  perform tests.logout();
  perform tests.login(v_app);
  perform tests.throws(format('select public.apply_for_membership(%L, %L)', v_c, 'Ben'), 'suspended member cannot re-apply', '42501');
  perform tests.logout();
end $$;

-- Invitations: token shown once, hashed at rest, bound to email.
do $$
declare
  v_c uuid := tests.community('Invite C');
  v_sec uuid := tests.user('sec@t.io', 'Sam Secretary');
  v_inv uuid := tests.user('invitee@t.io', 'Ivy Invitee');
  v_other uuid := tests.user('other@t.io', 'Oscar');
  v_token text;
begin
  perform tests.member(v_c, v_sec);
  perform tests.role(v_sec, 'class_secretary', 'community', v_c);
  perform tests.login(v_sec);
  v_token := public.create_invitation(v_c, 'Invitee@T.io');
  perform tests.ok(length(v_token) = 48, 'invitation token issued');
  perform tests.ok(not exists (select 1 from public.invitations where token_hash = v_token), 'token is not stored in plaintext');
  perform tests.logout();
  perform tests.login(v_other);
  perform tests.throws(format('select public.accept_invitation(%L)', v_token), 'invitation bound to its email', '42501');
  perform tests.logout();
  perform tests.login(v_inv);
  perform tests.ok(public.accept_invitation(v_token) = v_c, 'invitee joins via invitation');
  perform tests.ok(private.is_member(v_c), 'invitee is a verified member');
  perform tests.throws(format('select public.accept_invitation(%L)', v_token), 'invitation is single-use', 'P0002');
  perform tests.logout();
end $$;
