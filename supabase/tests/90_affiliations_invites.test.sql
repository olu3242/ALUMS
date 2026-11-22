-- Institution ↔ alumni-group affiliations and invitation codes.
do $$
declare
  v_i uuid := tests.institution('Affiliation University'); v_unv uuid;
  v_c uuid := tests.community('Acc 2007 Aff'); v_dup uuid := tests.community('Dup Class'); v_other uuid := tests.community('Other Class');
  v_ca uuid := tests.user('ca9@t.io', 'Class Admin'); v_ia uuid := tests.user('ia9@t.io', 'Inst Admin');
  v_ia2 uuid := tests.user('ia9b@t.io', 'Inst Admin 2'); v_m uuid := tests.user('m9@t.io', 'Member');
  v_aff uuid; v_aff2 uuid;
begin
  insert into public.institutions (name, slug, status) values ('Unverified College', 'unverified-college', 'unverified') returning id into v_unv;
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_m);
  perform tests.role(v_ia, 'institution_admin', 'institution', v_i);
  perform tests.role(v_ia2, 'institution_admin', 'institution', v_i);

  perform tests.login(v_m);
  perform tests.throws(format('select public.request_affiliation(%L, %L)', v_c, v_i), 'members cannot request affiliation', '42501');
  perform tests.logout();

  perform tests.login(v_ca);
  perform tests.throws(format('select public.request_affiliation(%L, %L)', v_c, v_unv), 'only verified institutions', 'P0002');
  v_aff := public.request_affiliation(v_c, v_i, 'We are the 2007 accounting class');
  perform tests.throws(format('select public.request_affiliation(%L, %L)', v_c, v_i), 'no duplicate live requests', 'P0001');
  perform tests.throws(format('select public.decide_affiliation(%L, true)', v_aff), 'class admin cannot approve own request', '42501');
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.notifications where user_id = v_ia and kind = 'affiliation.requested'), 'institution admins notified');

  perform tests.login(v_ia, 'aal1');
  perform tests.throws(format('select public.decide_affiliation(%L, true)', v_aff), 'approval requires MFA', '42501');
  perform tests.logout();
  perform tests.login(v_ia);
  perform tests.ok((select count(*) from public.community_affiliations where institution_id = v_i) = 1, 'institution admin sees incoming request');
  perform public.decide_affiliation(v_aff, true, 'Welcome');
  perform tests.ok(private.can('membership.approve', v_c), 'approved affiliation brings the class under institution governance');
  perform tests.ok((select active_members from public.institution_network_stats(v_i) where community_id = v_c) = 2, 'network stats are real');
  perform tests.logout();
  perform tests.ok((select institution_id from public.class_communities where id = v_c) = v_i, 'community linked to institution');
  perform tests.ok(exists (select 1 from public.departments where institution_id = v_i and name = 'Dept Acc 2007 Aff'), 'department created under institution');

  -- Identity collision: a second class with the same department/year cannot also affiliate
  update public.class_communities set department_name = 'Dept Acc 2007 Aff' where id = v_dup;
  perform tests.member(v_dup, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_dup);
  perform tests.login(v_ca);
  v_aff2 := public.request_affiliation(v_dup, v_i);
  perform tests.logout();
  perform tests.login(v_ia2);
  perform tests.throws(format('select public.decide_affiliation(%L, true)', v_aff2), 'duplicate class identity rejected', 'P0001');
  perform public.decide_affiliation(v_aff2, false, 'Duplicate of an existing class');
  perform tests.logout();

  -- Community can leave
  perform tests.login(v_ca);
  perform tests.throws(format('select public.revoke_affiliation(%L, %L)', v_aff, ''), 'reason required', '22023');
  perform public.revoke_affiliation(v_aff, 'Moving to the official association');
  perform tests.logout();
  perform tests.ok((select institution_id from public.class_communities where id = v_c) is null, 'leaving unlinks the institution');
  perform tests.login(v_ia);
  perform tests.ok(not private.can('membership.approve', v_c), 'institution loses governance after revocation');
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'affiliation.revoked'), 'revocation audited');
  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.community_affiliations) = 0, 'ordinary members cannot read affiliation records');
  perform tests.logout();
end $$;

do $$
declare
  v_c uuid := tests.community('Code Class'); v_x uuid := tests.community('Code Other');
  v_ca uuid := tests.user('ca10@t.io', 'Admin'); v_sec uuid := tests.user('sec10@t.io', 'Secretary');
  v_u1 uuid := tests.user('u10a@t.io', 'Una One'); v_u2 uuid := tests.user('u10b@t.io', 'Ugo Two');
  v_u3 uuid := tests.user('u10c@t.io', 'Uche Three'); v_unconf uuid := tests.user('u10d@t.io', 'Unconfirmed', false);
  v_auto text; v_review text; v_single text; v_r jsonb; i int;
begin
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_sec); perform tests.role(v_sec, 'class_secretary', 'community', v_c);

  perform tests.login(v_sec);
  perform tests.throws(format('select public.create_invite_code(%L, %L, true)', v_c, 'x'), 'secretary cannot create auto-verifying codes', '42501');
  v_review := public.create_invite_code(v_c, 'Reunion flyer', false, null, 30);
  perform tests.throws(format('select public.create_invite_code(%L)', v_x), 'cannot create codes for another class', '42501');
  perform tests.logout();
  perform tests.login(v_ca);
  v_auto := public.create_invite_code(v_c, 'WhatsApp group', true, 100, 14);
  v_single := public.create_invite_code(v_c, 'One person', true, 1, 7);
  perform tests.ok(v_auto ~ '^CODE-[A-Z2-9]{6}$', 'code format uses class prefix and unambiguous characters');
  perform tests.ok((select count(*) from public.invite_codes) = 3, 'leaders see their class codes');
  perform tests.logout();

  perform tests.login(v_unconf);
  perform tests.throws(format('select public.redeem_invite_code(%L)', v_auto), 'unverified email cannot redeem', '42501');
  perform tests.logout();

  perform tests.login(v_u1);
  perform tests.ok((select count(*) from public.invite_codes) = 0, 'non-leaders cannot list codes');
  v_r := public.redeem_invite_code(lower(v_auto));
  perform tests.ok(v_r ->> 'status' = 'joined', 'auto code verifies membership (case-insensitive)');
  perform tests.ok(private.is_member(v_c), 'member has access');
  perform tests.ok(public.redeem_invite_code(v_auto) ->> 'status' = 'already_member', 'repeat redemption is harmless');
  perform tests.logout();
  perform tests.ok((select verification_method from public.memberships where user_id = v_u1) = 'invitation_code', 'verification method recorded');

  perform tests.login(v_u2);
  v_r := public.redeem_invite_code(v_review);
  perform tests.ok(v_r ->> 'status' = 'requested' and not private.is_member(v_c), 'review code creates a pending request, not access');
  perform tests.ok((select note from public.membership_requests where user_id = v_u2) like '%Reunion flyer%', 'request notes the code label');
  perform tests.ok(public.redeem_invite_code(v_single) ->> 'status' = 'joined', 'single-use code works once');
  perform tests.logout();
  perform tests.login(v_u3);
  perform tests.ok(public.redeem_invite_code(v_single) ->> 'status' = 'invalid', 'single-use code is exhausted');
  for i in 1..9 loop perform public.redeem_invite_code('CODE-ZZZZZ' || i); end loop;
  perform tests.throws(format('select public.redeem_invite_code(%L)', v_auto), 'brute force throttled after 10 failures', 'P0001');
  perform tests.throws('select * from public.invite_code_attempts', 'attempt log is not readable', '42501');
  perform tests.logout();

  perform tests.login(v_ca);
  perform public.revoke_invite_code((select id from public.invite_codes where code = v_auto));
  perform tests.logout();
  delete from public.invite_code_attempts;
  perform tests.login(v_u3);
  perform tests.ok(public.redeem_invite_code(v_auto) ->> 'status' = 'invalid', 'revoked code no longer works');
  perform tests.logout();
  update public.invite_codes set expires_at = now() - interval '1 minute' where code = v_review;
  perform tests.login(v_u3);
  perform tests.ok(public.redeem_invite_code(v_review) ->> 'status' = 'invalid', 'expired code no longer works');
  perform tests.logout();
  perform tests.ok((select uses from public.invite_codes where code = v_auto) = 1, 'use counts are real');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'invite_code.redeemed'), 'redemptions audited');
end $$;
