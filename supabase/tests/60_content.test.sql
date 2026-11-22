-- Workflows C (business) and D (events), announcements, moderation, metrics.
do $$
declare
  v_c uuid := tests.community('Content C');
  v_ca uuid := tests.user('ca3@t.io', 'Cara Admin');
  v_o uuid := tests.user('o3@t.io', 'Owen Owner');
  v_m uuid := tests.user('m3@t.io', 'Mia Member');
  v_m4 uuid := tests.user('m4@t.io', 'Moe Member');
  v_biz uuid; v_ev uuid; v_draft uuid; v_rep uuid; v_metrics jsonb;
begin
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_o); perform tests.member(v_c, v_m); perform tests.member(v_c, v_m4);

  -- Business: draft → submit → approve → listed; edits return to review
  perform tests.login(v_o);
  insert into public.businesses (community_id, name, services) values (v_c, 'Owen Audit Ltd', array['Audit', 'Tax']) returning id into v_biz;
  perform tests.throws(format('select public.review_business(%L, %L)', v_biz, 'approve'), 'owner cannot approve own listing', '42501');
  perform public.submit_business(v_biz);
  perform tests.logout();
  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.businesses) = 0, 'unapproved listings are not visible to members');
  perform tests.logout();
  perform tests.login(v_ca, 'aal1');
  perform public.review_business(v_biz, 'approve', 'Verified registration', true);
  perform tests.logout();
  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.businesses where owner_verified) = 1, 'approved listing visible with owner verification');
  perform tests.ok((select is_business_owner from public.community_directory(v_c) where user_id = v_o), 'directory flags business owners');
  perform tests.logout();
  perform tests.login(v_o);
  update public.businesses set description = 'Now with advisory' where id = v_biz;
  perform tests.logout();
  perform tests.ok((select status from public.businesses where id = v_biz) = 'submitted', 'editing an approved listing returns it to review');

  -- Events: only leaders create; members RSVP to published events; capacity enforced
  perform tests.login(v_m);
  perform tests.throws(format('insert into public.events (community_id, title, starts_at, status) values (%L, %L, now() + interval ''2 days'', %L)',
    v_c, 'Rogue', 'published'), 'members cannot create events', '42501');
  perform tests.logout();
  perform tests.login(v_ca);
  insert into public.events (community_id, title, starts_at, status, capacity) values (v_c, 'Reunion', now() + interval '12 hours', 'published', 1) returning id into v_ev;
  insert into public.events (community_id, title, starts_at) values (v_c, 'Draft plan', now() + interval '30 days') returning id into v_draft;
  perform tests.logout();
  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.events) = 1, 'members do not see draft events');
  insert into public.event_rsvps (event_id, status) values (v_ev, 'going');
  perform tests.throws(format('insert into public.event_rsvps (event_id, status) values (%L, %L)', v_draft, 'going'), 'cannot RSVP to drafts', '42501');
  perform tests.throws(format('update public.event_rsvps set attended = true where event_id = %L', v_ev), 'members cannot mark own attendance', '42501');
  perform tests.logout();
  perform tests.login(v_m4);
  perform tests.throws(format('insert into public.event_rsvps (event_id, status) values (%L, %L)', v_ev, 'going'), 'capacity enforced', 'P0001');
  insert into public.event_rsvps (event_id, status) values (v_ev, 'maybe');
  perform tests.ok((public.event_rsvp_summary(v_ev) ->> 'going')::int = 1, 'RSVP summary counts real responses');
  perform tests.logout();
  perform tests.login(v_ca);
  perform public.mark_attendance(v_ev, v_m, true);
  perform tests.ok((select count(*) from public.event_attendees(v_ev) where attended) = 1, 'leaders record attendance');
  perform tests.logout();
  perform tests.ok(private.enqueue_event_reminders() = 2, 'reminders queued for going/maybe within 24h');
  perform tests.ok(private.enqueue_event_reminders() = 0, 'reminder sweep is idempotent');

  -- Announcements fan out to members
  perform tests.login(v_ca);
  insert into public.announcements (community_id, title, body) values (v_c, 'Dues update', 'Details inside');
  perform tests.logout();
  perform tests.ok((select count(*) from public.notifications where kind = 'announcement.published') = 3, 'announcement notifies the other members');

  -- Moderation
  perform tests.login(v_m);
  insert into public.moderation_reports (community_id, target_type, target_id, reason) values (v_c, 'event', v_ev, 'Wrong venue') returning id into v_rep;
  perform tests.throws(format('select public.resolve_report(%L, %L)', v_rep, 'dismissed'), 'reporters cannot resolve', '42501');
  perform tests.logout();
  perform tests.login(v_ca);
  perform public.resolve_report(v_rep, 'actioned', 'Venue corrected');
  v_metrics := public.admin_overview('community', v_c);
  perform tests.ok((v_metrics ->> 'active_members')::int = 4, 'metrics reflect real member count');
  perform tests.ok((v_metrics ->> 'businesses_pending')::int = 1 and (v_metrics ->> 'open_reports')::int = 0, 'metrics reflect real queues');
  perform tests.ok((select count(*) from public.admin_audit_logs('community', v_c)) >= 5, 'community audit trail is readable by its admin');
  perform tests.logout();
end $$;

do $$
begin
  perform tests.ok(exists (select 1 from public.notifications where kind = 'moderation.reported'), 'moderators notified of new reports');
end $$;
