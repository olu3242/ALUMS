-- Class dashboard header: who may edit, path scoping, audit, anon surface.
do $$
declare
  v_c uuid := tests.community('Header 07'); v_d uuid := tests.community('Header 09');
  v_ca uuid := tests.user('ca96@t.io', 'Class Admin'); v_m uuid := tests.user('m96@t.io', 'Member');
  v_oa uuid := tests.user('oa96@t.io', 'Other Admin'); v_sa uuid := tests.user('sa96@t.io', 'Super Admin');
begin
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_m);
  perform tests.member(v_d, v_oa); perform tests.role(v_oa, 'class_admin', 'community', v_d);
  perform tests.role(v_sa, 'super_admin', 'platform');

  perform tests.login(v_ca, 'aal1');
  insert into storage.objects (bucket_id, name, owner) values ('community-media', v_c || '/header/cover.jpg', v_ca);
  perform public.update_community_header(v_c, '  Ten years on  ', v_c || '/header/cover.jpg');
  perform tests.throws(format('select public.update_community_header(%L, %L, %L)', v_c, 'x', v_d || '/header/cover.jpg'),
    'cover must live in this community''s header folder', '22023');
  perform tests.throws(format('select public.update_community_header(%L, %L, %L)', v_c, 'x', v_c || '/header/missing.jpg'),
    'cover must exist in storage', 'P0002');
  perform tests.throws(format('select public.update_community_header(%L, %L)', v_d, 'x'), 'class admin cannot edit another class header', '42501');
  perform tests.logout();
  perform tests.ok((select header_tagline from public.class_communities where id = v_c) = 'Ten years on', 'tagline saved (trimmed)');
  perform tests.ok((select header_cover_path from public.class_communities where id = v_c) = v_c || '/header/cover.jpg', 'cover saved');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'community.header_updated' and actor_id = v_ca and scope_id = v_c),
    'header change audited with real actor');

  perform tests.login(v_m);
  perform tests.throws(format('select public.update_community_header(%L, %L)', v_c, 'x'), 'plain members cannot edit the header', '42501');
  perform tests.logout();
  perform tests.login(v_oa);
  perform tests.throws(format('select public.update_community_header(%L, %L)', v_c, 'x'), 'other class admins cannot edit it', '42501');
  perform tests.logout();

  perform tests.login(v_sa, 'aal1');
  perform public.update_community_header(v_c, 'Platform edit', null, true);
  perform tests.logout();
  perform tests.ok((select header_cover_path is null and header_tagline = 'Platform edit' from public.class_communities where id = v_c),
    'platform admin can edit and remove the cover');

  perform tests.anon();
  perform tests.throws('select header_cover_path from public.class_communities', 'anon cannot read header cover paths', '42501');
  perform tests.throws(format('select public.update_community_header(%L, %L)', v_c, 'x'), 'anon cannot edit', '42501');
  perform tests.logout();
end $$;
