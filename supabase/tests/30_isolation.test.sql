-- BR-2 / BR-4: strict cross-community isolation.
do $$
declare
  v_a uuid := tests.community('Class A'); v_b uuid := tests.community('Class B');
  v_admin_a uuid := tests.user('admina@t.io', 'Admin A');
  v_mem_a uuid := tests.user('mema@t.io', 'Member A');
  v_mem_b uuid := tests.user('memb@t.io', 'Member B');
  v_applicant uuid := tests.user('appb@t.io', 'Applicant B');
  v_ev_b uuid; v_req_b uuid; v_album_b uuid; v_album_a uuid; v_biz_b uuid;
begin
  perform tests.member(v_a, v_admin_a); perform tests.role(v_admin_a, 'class_admin', 'community', v_a);
  perform tests.member(v_a, v_mem_a); perform tests.member(v_b, v_mem_b);

  insert into public.events (community_id, title, starts_at, status, created_by) values (v_b, 'B reunion', now() + interval '7 days', 'published', v_mem_b) returning id into v_ev_b;
  insert into public.announcements (community_id, title, body, author_id) values (v_b, 'B news', 'secret', v_mem_b);
  insert into public.albums (community_id, title, created_by) values (v_b, 'B album', v_mem_b) returning id into v_album_b;
  insert into public.albums (community_id, title, created_by) values (v_a, 'A album', v_admin_a) returning id into v_album_a;
  insert into public.businesses (community_id, owner_id, name, status) values (v_b, v_mem_b, 'B Biz', 'submitted') returning id into v_biz_b;
  insert into public.membership_requests (community_id, user_id, name_at_graduation) values (v_b, v_applicant, 'App B') returning id into v_req_b;

  perform tests.login(v_mem_a);
  perform tests.ok((select count(*) from public.events where community_id = v_b) = 0, 'member of A cannot see B events');
  perform tests.ok((select count(*) from public.announcements where community_id = v_b) = 0, 'member of A cannot see B announcements');
  perform tests.ok((select count(*) from public.albums where community_id = v_b) = 0, 'member of A cannot see B albums');
  perform tests.ok((select count(*) from public.memberships where community_id = v_b) = 0, 'member of A cannot list B memberships');
  perform tests.ok((select count(*) from public.community_directory()) = 2, 'cross-community directory only spans own communities');
  perform tests.throws(format('select * from public.community_directory(%L)', v_b), 'member of A cannot read B directory', '42501');
  perform tests.throws(format('select public.get_member_profile(%L)', v_mem_b), 'member of A cannot open B member profile', '42501');
  perform tests.throws(format('select public.event_rsvp_summary(%L)', v_ev_b), 'member of A cannot read B event stats', '42501');
  perform tests.throws(format('insert into public.event_rsvps (event_id, status) values (%L, %L)', v_ev_b, 'going'), 'member of A cannot RSVP to B event', '42501');
  perform tests.throws(format('insert into public.media_assets (community_id, album_id, storage_path, mime_type, bytes) values (%L, %L, %L, %L, 10)',
    v_b, v_album_b, v_b || '/x/y.png', 'image/png'), 'member of A cannot upload media into B', '42501');
  perform tests.throws(format('insert into public.media_assets (community_id, album_id, storage_path, mime_type, bytes) values (%L, %L, %L, %L, 10)',
    v_a, v_album_b, v_a || '/x/y.png', 'image/png'), 'media cannot point at another community''s album', '23514');
  perform tests.throws(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)', 'community-media', v_b || '/a/b.png', v_mem_a),
    'storage upload into B folder is blocked', '42501');
  perform tests.throws(format('insert into public.businesses (community_id, name) values (%L, %L)', v_b, 'Sneaky'), 'cannot list a business in B', '42501');
  perform tests.throws(format('insert into public.moderation_reports (community_id, target_type, target_id, reason) values (%L, %L, %L, %L)',
    v_b, 'event', v_ev_b, 'spam spam'), 'cannot file reports in B', '42501');
  perform tests.logout();

  perform tests.login(v_admin_a);
  perform tests.throws(format('select public.review_membership_request(%L, true)', v_req_b), 'admin of A cannot approve B requests', '42501');
  perform tests.throws(format('select * from public.admin_membership_requests(%L)', v_b), 'admin of A cannot view B queue', '42501');
  perform tests.throws(format('select * from public.admin_members(%L)', v_b), 'admin of A cannot view B roster', '42501');
  perform tests.throws(format('select public.admin_overview(%L, %L)', 'community', v_b), 'admin of A cannot view B metrics', '42501');
  perform tests.throws(format('select public.review_business(%L, %L)', v_biz_b, 'approve'), 'admin of A cannot approve B businesses', '42501');
  perform tests.throws(format('insert into public.events (community_id, title, starts_at) values (%L, %L, now())', v_b, 'x'), 'admin of A cannot create B events', '42501');
  perform tests.throws(format('insert into public.announcements (community_id, title, body) values (%L, %L, %L)', v_b, 'xx', 'y'), 'admin of A cannot post in B', '42501');
  perform tests.throws(format('select public.create_invitation(%L, %L)', v_b, 'x@t.io'), 'admin of A cannot invite into B', '42501');
  perform tests.throws(format('select public.assign_role(%L, %L, %L, %L)', v_mem_b, 'class_secretary', 'community', v_b), 'admin of A cannot assign roles in B', '42501');
  perform tests.throws(format('select * from public.admin_audit_logs(%L, %L)', 'community', v_b), 'admin of A cannot read B audit logs', '42501');
  update public.events set title = 'hijacked' where id = v_ev_b;
  perform tests.ok((select count(*) from public.admin_communities()) = 1, 'admin of A only administers A');
  perform tests.ok((select count(*) from public.audit_logs where scope_id = v_b) = 0, 'admin of A sees no B audit rows');
  perform tests.logout();
  perform tests.ok((select title from public.events where id = v_ev_b) = 'B reunion', 'admin of A cannot edit B events');
end $$;

-- Institution scope covers its communities only.
do $$
declare
  v_i uuid := tests.institution('Test University'); v_j uuid := tests.institution('Other University');
  v_ci uuid := tests.community('In I', 'active', v_i); v_cj uuid := tests.community('In J', 'active', v_j);
  v_ia uuid := tests.user('ia@t.io', 'Inst Admin'); v_req uuid; v_x uuid := tests.user('x@t.io', 'X');
begin
  perform tests.role(v_ia, 'institution_admin', 'institution', v_i);
  insert into public.membership_requests (community_id, user_id, name_at_graduation) values (v_cj, v_x, 'Xavier') returning id into v_req;
  perform tests.login(v_ia);
  perform tests.ok(private.can('membership.approve', v_ci), 'institution admin governs communities in their institution');
  perform tests.ok(not private.can('membership.approve', v_cj), 'institution admin has no power in other institutions');
  perform tests.throws(format('select public.review_membership_request(%L, true)', v_req), 'institution admin cannot approve elsewhere', '42501');
  perform tests.logout();
end $$;
