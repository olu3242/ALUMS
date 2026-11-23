-- Class modules on/off (locks, MFA, audit, isolation) and invitation listing/revocation.
do $$
declare
  v_c uuid := tests.community('Feat 07'); v_d uuid := tests.community('Feat 09');
  v_pa uuid := tests.user('pa99@t.io', 'Platform Admin'); v_ca uuid := tests.user('ca99@t.io', 'Class Admin');
  v_m uuid := tests.user('m99@t.io', 'Member'); v_o uuid := tests.user('o99@t.io', 'Outsider'); v_inv uuid;
begin
  perform tests.role(v_pa, 'platform_admin', 'platform');
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_m); perform tests.member(v_d, v_o);

  perform tests.ok(private.feature_enabled(v_c, 'dues'), 'modules are on by default');
  perform tests.login(v_ca, 'aal1');
  perform tests.throws(format('select public.set_community_feature(%L, %L, false)', v_c, 'dues'), 'toggling needs MFA', '42501');
  perform tests.logout();
  perform tests.login(v_ca);
  perform public.set_community_feature(v_c, 'dues', false);
  perform tests.throws(format('select public.set_community_feature(%L, %L, false)', v_d, 'dues'), 'class admin cannot toggle another class', '42501');
  perform tests.throws(format('select public.set_community_feature(%L, %L, false, true)', v_c, 'gallery'), 'class admin cannot lock', '42501');
  perform tests.throws(format('select public.set_community_feature(%L, %L, false)', v_c, 'payroll'), 'unknown feature rejected', '22023');
  perform tests.logout();
  perform tests.ok(not private.feature_enabled(v_c, 'dues'), 'dues turned off');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'community.feature_changed' and actor_id = v_ca), 'toggle audited');

  perform tests.login(v_pa);
  perform public.set_community_feature(v_c, 'gallery', false, true);
  perform tests.logout();
  perform tests.login(v_ca);
  perform tests.throws(format('select public.set_community_feature(%L, %L, true)', v_c, 'gallery'), 'locked feature cannot be re-enabled by class admin', '42501');
  perform tests.logout();

  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.community_features where community_id = v_c) = 2, 'members can read their class modules');
  perform tests.throws(format('insert into public.community_features (community_id, feature, enabled) values (%L, %L, true)', v_c, 'gallery'),
    'no direct writes', '42501');
  perform tests.logout();
  perform tests.login(v_o);
  perform tests.ok((select count(*) from public.community_features where community_id = v_c) = 0, 'outsiders cannot read another class''s modules');
  perform tests.logout();

  -- Invitations: listed for leaders, revocable while pending
  perform tests.login(v_ca);
  perform public.create_invitation(v_c, 'friend99@t.io');
  select id into v_inv from public.invitations where email = 'friend99@t.io';
  perform tests.ok(v_inv is not null, 'leader can list invitations');
  perform public.revoke_invitation(v_inv);
  perform tests.logout();
  perform tests.ok((select revoked_at is not null from public.invitations where id = v_inv), 'invitation revoked');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'membership.invitation_revoked'), 'revocation audited');
  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.invitations where community_id = v_c) = 0, 'plain members cannot see invitations');
  perform tests.throws(format('select public.revoke_invitation(%L)', v_inv), 'plain members cannot revoke', '42501');
  perform tests.logout();
end $$;
