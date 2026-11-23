-- Gap batch 1: feature switches enforced in the database; member data export.
do $$
declare
  v_c uuid := tests.community('Hard 07'); v_d uuid := tests.community('Hard 09');
  v_ca uuid := tests.user('ca9a@t.io', 'Hard Admin'); v_m uuid := tests.user('m9a@t.io', 'Hard Member');
  v_o uuid := tests.user('o9a@t.io', 'Other Member'); v_ev uuid; v_x jsonb;
begin
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_m); perform tests.member(v_d, v_o);
  insert into public.events (community_id, title, starts_at, status, created_by) values (v_c, 'Reunion', now() + interval '10 days', 'published', v_ca) returning id into v_ev;

  perform tests.login(v_ca);
  perform public.set_community_feature(v_c, 'announcements', false);
  perform public.set_community_feature(v_c, 'events', false);
  perform public.set_community_feature(v_c, 'gallery', false);
  perform tests.throws(format('insert into public.announcements (community_id, title, body) values (%L, %L, %L)', v_c, 'Hi all', 'x'),
    'announcements refused while the module is off', '42501');
  perform tests.throws(format('insert into public.events (community_id, title, starts_at, created_by) values (%L, %L, now() + interval ''1 day'', %L)', v_c, 'Dinner', v_ca),
    'events refused while the module is off', '42501');
  perform tests.throws(format('insert into public.albums (community_id, title) values (%L, %L)', v_c, 'Pics'), 'albums refused while gallery is off', '42501');
  -- existing content stays manageable
  update public.events set status = 'cancelled' where id = v_ev;
  perform tests.logout();
  perform tests.ok((select status = 'cancelled' from public.events where id = v_ev), 'existing rows remain manageable when a module is off');

  perform tests.login(v_m);
  perform tests.throws(format('insert into public.event_rsvps (event_id, status) values (%L, %L)', v_ev, 'going'), 'RSVPs refused while events are off', '42501');
  perform tests.logout();

  perform tests.login(v_ca);
  perform public.set_community_feature(v_c, 'announcements', true);
  insert into public.announcements (community_id, title, body) values (v_c, 'Back on', 'Welcome back');
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.announcements where title = 'Back on'), 'turning a module back on allows new rows');
  perform tests.login(v_o);
  perform tests.ok((select count(*) from public.announcements where community_id = v_c) = 0, 'other classes unaffected and still isolated');
  perform tests.logout();

  -- Data export: own data only, audited
  perform tests.login(v_m);
  v_x := public.export_my_data();
  perform tests.logout();
  perform tests.ok(v_x -> 'account' ->> 'email' = 'm9a@t.io', 'export contains own account');
  perform tests.ok(jsonb_array_length(v_x -> 'memberships') = 1 and v_x -> 'memberships' -> 0 ->> 'class' = 'Hard 07', 'export contains own memberships only');
  perform tests.ok(v_x::text not like '%o9a@t.io%' and v_x::text not like '%ca9a@t.io%', 'export contains no other member''s data');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'account.data_exported' and actor_id = v_m), 'export audited');
  perform tests.anon();
  perform tests.throws('select public.export_my_data()', 'anon cannot export', '42501');
  perform tests.logout();
end $$;
