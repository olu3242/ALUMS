-- Workflow OS (A–E) progression from real domain events, and scheduled automations.
do $$
declare
  v_c uuid := tests.community('Workflow Class'); v_ca uuid := tests.user('ca11@t.io', 'Cara Admin');
  v_tr uuid := tests.user('tr11@t.io', 'Tolu Treasurer'); v_app uuid := tests.user('app11@t.io', 'Ada Applicant');
  v_out uuid := tests.user('out11@t.io', 'Oscar Outsider');
  v_req uuid; v_biz uuid; v_ev uuid; v_plan uuid; v_n int; v_run record;
begin
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_tr); perform tests.role(v_tr, 'class_treasurer', 'community', v_c);

  -- A · Membership: apply → waiting on review gate → approved → dashboard
  perform tests.login(v_app);
  v_req := public.apply_for_membership(v_c, 'Ada Applicant');
  perform tests.ok((select state || ':' || current_step from public.workflow_runs where subject_id = v_req) = 'waiting:review', 'A waits at the review gate');
  perform tests.ok((select count(*) from public.workflow_run_steps s join public.workflow_runs r on r.id = s.run_id where r.subject_id = v_req and s.outcome = 'completed') = 4,
    'register, verify-email, find-class, apply recorded');
  perform tests.logout();
  perform tests.login(v_ca);
  perform public.review_membership_request(v_req, true);
  perform tests.logout();
  perform tests.ok((select current_step from public.workflow_runs where subject_id = v_req) = 'dashboard', 'approval advances A to dashboard');
  perform tests.ok((select actor_id from public.workflow_run_steps s join public.workflow_runs r on r.id = s.run_id where r.subject_id = v_req and s.step_id = 'approve') = v_ca,
    'step records the real actor');
  perform tests.login(v_app);
  perform public.workflow_touch_dashboard(v_c);
  perform tests.ok((select state from public.workflow_runs where subject_id = v_req) = 'completed', 'A completes when the member opens the dashboard');
  perform tests.ok((select count(*) from public.workflow_runs where workflow_id = 'A-membership') = 1, 'members see only their own runs');
  perform tests.logout();

  -- B · Profile
  perform tests.ok((select state from public.workflow_runs where workflow_id = 'B-profile' and subject_id = v_app) = 'running', 'B starts when the profile is created');
  perform tests.login(v_app);
  update public.profiles set name_at_graduation = 'Ada A.', profession = 'Auditor', headline = 'Audit lead' where id = v_app;
  perform public.workflow_mark_privacy_reviewed();
  update public.profiles set about = 'Hello' where id = v_app;
  perform tests.ok((select state from public.workflow_runs where workflow_id = 'B-profile' and subject_id = v_app) = 'completed', 'B completes when profile is published');
  perform tests.logout();

  -- C · Business: submit waits at review, approval lists it
  perform tests.login(v_app);
  insert into public.businesses (community_id, name, services) values (v_c, 'Ada Audit', array['Audit']) returning id into v_biz;
  perform public.submit_business(v_biz);
  perform tests.ok((select state || ':' || current_step from public.workflow_runs where subject_id = v_biz) = 'waiting:review', 'C waits for review');
  perform tests.logout();
  perform tests.login(v_ca);
  perform public.review_business(v_biz, 'approve');
  perform tests.logout();
  perform tests.ok((select state from public.workflow_runs where subject_id = v_biz) = 'completed', 'C completes when listed');

  -- D · Events
  perform tests.login(v_ca);
  insert into public.events (community_id, title, starts_at, status) values (v_c, 'Reunion', now() + interval '12 hours', 'published') returning id into v_ev;
  perform tests.logout();
  perform tests.login(v_app);
  insert into public.event_rsvps (event_id, status) values (v_ev, 'going');
  perform tests.logout();
  perform tests.login(v_ca);
  perform public.mark_attendance(v_ev, v_app, true);
  perform tests.logout();
  perform tests.ok((select state from public.workflow_runs where subject_id = v_ev) = 'completed', 'D completes create → discover → rsvp → attendance');

  -- E · Administration: verify (active), admin assigned via fixture (direct), handover on first leadership action
  perform tests.ok((select count(*) from public.workflow_run_steps s join public.workflow_runs r on r.id = s.run_id
                    where r.workflow_id = 'E-administration' and r.subject_id = v_c and s.step_id in ('verify-community', 'manage')) = 2,
    'E records verification and leadership handover');

  -- Visibility: class admin (audit.view) sees community runs; outsiders see none
  perform tests.login(v_ca);
  perform tests.ok((select count(*) from public.workflow_runs where community_id = v_c) >= 3, 'class admin sees their community runs');
  perform tests.throws($q$select * from public.run_automations_now()$q$, 'class admins cannot trigger platform automations', '42501');
  perform tests.logout();
  perform tests.login(v_out);
  perform tests.ok((select count(*) from public.workflow_runs where community_id = v_c) = 0, 'outsiders cannot see another class''s runs');
  perform tests.throws($q$insert into public.workflow_runs (workflow_id, subject_type, subject_id) values ('A-membership', 'x', gen_random_uuid())$q$,
    'runs are not client-writable', '42501');
  perform tests.logout();

  -- Automations: SLA reminder fires once, dues reminders target only unpaid members, failures isolated & logged
  perform tests.login(v_out);
  v_req := public.apply_for_membership(v_c, 'Oscar O');
  perform tests.logout();
  update public.membership_requests set created_at = now() - interval '3 days' where id = v_req;
  perform private.run_job('membership_sla');
  perform private.run_job('membership_sla');
  perform tests.ok((select count(*) from public.notifications where kind = 'automation.membership_sla' and user_id = v_ca) = 1, 'SLA reminder sent exactly once');

  perform tests.login(v_tr);
  v_plan := public.create_dues_plan(v_c, 'Dues 2027', 100000, 'NGN', 'annual', current_date + 3);
  perform tests.logout();
  perform tests.login(v_app);
  perform public.submit_dues_payment(v_plan, 100000, 'bank_transfer', 'REF');
  perform tests.logout();
  perform private.run_job('dues_reminders');
  perform private.run_job('dues_reminders');
  perform tests.ok((select count(*) from public.notifications where kind = 'dues.due_soon') = 2, 'due-soon reminders: admin + treasurer, once each; payer skipped');
  perform tests.ok(not exists (select 1 from public.notifications where kind = 'dues.due_soon' and user_id = v_app), 'members who paid are not reminded');

  update public.memberships set verified_at = now() - interval '5 days' where community_id = v_c;
  perform private.run_job('profile_nudges');
  perform tests.ok(not exists (select 1 from public.notifications where kind = 'automation.profile_nudge' and user_id = v_app), 'complete profiles are not nudged');
  perform tests.ok(exists (select 1 from public.notifications where kind = 'automation.profile_nudge' and user_id = v_ca), 'incomplete profiles are nudged');

  perform tests.ok((select count(*) from public.automation_runs where status = 'succeeded') >= 5, 'job runs are logged');
  insert into public.automation_jobs (key, name, description, schedule) values ('broken_job', 'Broken', 'x', 'never');
  perform private.run_job('broken_job');
  perform tests.ok((select status from public.automation_runs where job_key = 'broken_job') = 'succeeded'
                   and (select processed from public.automation_runs where job_key = 'broken_job') = 0, 'unknown jobs are harmless no-ops');
  perform private.run_all_automations();
  perform tests.ok(not exists (select 1 from public.automation_runs where status = 'running'), 'every run finishes with a status');
end $$;

do $$
declare v_pa uuid := tests.user('pa11@t.io', 'Plat'); v_c uuid := tests.community('Invite WF'); v_m uuid := tests.user('m11@t.io', 'Mo'); v_code text; v_ca uuid := tests.user('ca12@t.io', 'Cal');
begin
  perform tests.role(v_pa, 'super_admin', 'platform');
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.login(v_ca); v_code := public.create_invite_code(v_c, null, true); perform tests.logout();
  perform tests.login(v_m); perform public.redeem_invite_code(v_code); perform tests.logout();
  perform tests.ok((select string_agg(s.step_id || '=' || s.outcome, ',' order by s.step_id) from public.workflow_run_steps s join public.workflow_runs r on r.id = s.run_id
                    where r.workflow_id = 'A-membership' and r.user_id = v_m) like '%apply=skipped%approve=completed%', 'invitation-code joins run A with request steps skipped');
  perform tests.ok(exists (select 1 from public.notifications where user_id = v_m and kind = 'membership.welcome'), 'welcome automation fires for code joins');
  perform tests.login(v_pa);
  perform tests.ok((select count(*) from public.run_automations_now()) >= 7, 'platform operators can run all jobs on demand');
  perform tests.ok((select count(*) from public.automation_jobs) >= 7, 'job registry visible to platform audit');
  perform tests.logout();
end $$;
