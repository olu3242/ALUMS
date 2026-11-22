-- Workflow OS in Postgres + scheduled automations.
-- Workflows A–E (automation/workflow-os/definitions.ts) are tracked as durable runs that advance automatically from
-- domain events (triggers). Scheduled jobs (pg_cron) send reminders/escalations. Everything is idempotent and logged.

-- Hardening: a NULL inside an exclusion list made `NOT (x = ANY(...))` NULL and silently notified no one.
create or replace function private.notify_holders(
  p_perm text, p_scope_type public.scope_type, p_scope_id uuid, p_kind text, p_title text, p_body text, p_link text,
  p_exclude uuid[] default '{}', p_include_platform boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, community_id, kind, title, body, link)
  select distinct ra.user_id, case when p_scope_type = 'community' then p_scope_id end, p_kind, p_title, p_body, p_link
  from public.role_assignments ra
  join public.role_permissions rp on rp.role_key = ra.role_key and rp.permission_key = p_perm
  where ra.status = 'active' and (ra.expires_at is null or ra.expires_at > now())
    and not (ra.user_id = any (array_remove(coalesce(p_exclude, '{}'), null)))
    and (
      (p_include_platform and ra.scope_type = 'platform')
      or (p_scope_type = 'platform' and ra.scope_type = 'platform')
      or (p_scope_type = 'institution' and ra.scope_type = 'institution' and ra.scope_id = p_scope_id)
      or (p_scope_type = 'community' and ra.scope_type = 'community' and ra.scope_id = p_scope_id
          and exists (select 1 from public.memberships m where m.community_id = p_scope_id and m.user_id = ra.user_id and m.status = 'active'))
      or (p_scope_type = 'community' and ra.scope_type = 'institution'
          and ra.scope_id = (select c.institution_id from public.class_communities c where c.id = p_scope_id)));
$$;

---------------------------------------------------------------------------
-- Workflow runs
---------------------------------------------------------------------------
create table public.workflow_runs (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  text not null check (workflow_id in ('A-membership', 'B-profile', 'C-business', 'D-events', 'E-administration')),
  subject_type text not null,
  subject_id   uuid not null,
  community_id uuid references public.class_communities (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete cascade,      -- the person the run is about (if any)
  state        text not null default 'running' check (state in ('running', 'waiting', 'completed', 'denied', 'cancelled')),
  current_step text,
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  unique (workflow_id, subject_id)
);
create index workflow_runs_community_idx on public.workflow_runs (community_id, workflow_id, state);
create index workflow_runs_user_idx on public.workflow_runs (user_id);

create table public.workflow_run_steps (
  id          bigint generated always as identity primary key,
  run_id      uuid not null references public.workflow_runs (id) on delete cascade,
  step_id     text not null,
  outcome     text not null check (outcome in ('completed', 'waiting', 'denied', 'skipped')),
  actor_id    uuid references auth.users (id) on delete set null,
  detail      jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (run_id, step_id)
);

-- Canonical step order (parity with definitions.ts is enforced by tests/workflow-parity.test.ts).
create function private.workflow_steps(p_workflow text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_workflow
    when 'A-membership'     then array['register','verify-email','find-class','apply','review','approve','dashboard']
    when 'B-profile'        then array['create','academic','career','privacy','publish']
    when 'C-business'       then array['create','services','submit','review','list']
    when 'D-events'         then array['create','discover','rsvp','attendance']
    when 'E-administration' then array['verify-community','assign-admin','manage']
  end
$$;
-- Steps that wait on a human decision (approval gates).
create function private.workflow_gates(p_workflow text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_workflow when 'A-membership' then array['review'] when 'C-business' then array['review']
                          when 'E-administration' then array['assign-admin'] else '{}'::text[] end
$$;

-- Record a step outcome and recompute run state. Completed/denied/skipped outcomes are final; 'waiting' may be upgraded.
create function private.wf_mark(p_workflow text, p_subject_type text, p_subject uuid, p_community uuid, p_user uuid,
                                p_step text, p_outcome text, p_actor uuid default null, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_run uuid; v_steps text[] := private.workflow_steps(p_workflow); v_done text[]; v_next text; v_denied boolean;
begin
  if not (p_step = any (v_steps)) then raise exception 'unknown step % for %', p_step, p_workflow; end if;
  insert into public.workflow_runs (workflow_id, subject_type, subject_id, community_id, user_id)
  values (p_workflow, p_subject_type, p_subject, p_community, p_user)
  on conflict (workflow_id, subject_id) do update set community_id = coalesce(public.workflow_runs.community_id, excluded.community_id)
  returning id into v_run;
  insert into public.workflow_run_steps (run_id, step_id, outcome, actor_id, detail)
  values (v_run, p_step, p_outcome, p_actor, coalesce(p_detail, '{}'::jsonb))
  on conflict (run_id, step_id) do update set outcome = excluded.outcome, actor_id = excluded.actor_id, detail = excluded.detail, occurred_at = now()
    where public.workflow_run_steps.outcome = 'waiting';
  select array_agg(step_id) filter (where outcome in ('completed', 'skipped')), bool_or(outcome = 'denied')
    into v_done, v_denied from public.workflow_run_steps where run_id = v_run;
  select s into v_next from unnest(v_steps) with ordinality u(s, i) where not (s = any (coalesce(v_done, '{}'))) order by i limit 1;
  update public.workflow_runs set
    current_step = v_next,
    state = case when v_denied then 'denied' when v_next is null then 'completed'
                 when v_next = any (private.workflow_gates(p_workflow)) then 'waiting' else 'running' end,
    completed_at = case when v_next is null and not v_denied then coalesce(completed_at, now()) end,
    updated_at = now()
  where id = v_run;
end $$;

create function private.wf_cancel(p_workflow text, p_subject uuid) returns void
language sql security definer set search_path = '' as $$
  update public.workflow_runs set state = 'cancelled', updated_at = now() where workflow_id = p_workflow and subject_id = p_subject and state in ('running', 'waiting');
$$;

---------------------------------------------------------------------------
-- A · Membership
---------------------------------------------------------------------------
create function private.wf_membership_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.wf_mark('A-membership', 'membership_request', new.id, new.community_id, new.user_id, s, 'completed', new.user_id)
    from unnest(array['register', 'verify-email', 'find-class', 'apply']) s;
    perform private.wf_mark('A-membership', 'membership_request', new.id, new.community_id, new.user_id, 'review', 'waiting', null);
  elsif new.status is distinct from old.status then
    if new.status = 'approved' then
      perform private.wf_mark('A-membership', 'membership_request', new.id, new.community_id, new.user_id, 'review', 'completed', new.reviewed_by);
      perform private.wf_mark('A-membership', 'membership_request', new.id, new.community_id, new.user_id, 'approve', 'completed', new.reviewed_by);
    elsif new.status = 'rejected' then
      perform private.wf_mark('A-membership', 'membership_request', new.id, new.community_id, new.user_id, 'review', 'denied', new.reviewed_by,
        jsonb_build_object('note', new.decision_note));
    elsif new.status = 'withdrawn' then
      perform private.wf_cancel('A-membership', new.id);
    end if;
  end if;
  return null;
end $$;
create trigger wf_membership_request after insert or update of status on public.membership_requests
  for each row execute function private.wf_membership_request();

-- Memberships created without a request (invitation, code, bootstrap) run A with the request steps skipped.
create function private.wf_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_req uuid;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return null; end if;
  -- Welcome automation (all paths; request_review approvals already notify in review_membership_request).
  if new.verification_method <> 'request_review' then
    perform private.notify(new.user_id, new.community_id, 'membership.welcome',
      'Welcome to ' || (select name from public.class_communities where id = new.community_id),
      'You are a verified member. Complete your profile so classmates can find you.', '/app/dashboard');
  end if;
  if new.verification_method = 'request_review' then return null; end if;  -- tracked by the request run
  select id into v_req from public.membership_requests where community_id = new.community_id and user_id = new.user_id order by created_at desc limit 1;
  perform private.wf_mark('A-membership', 'membership', new.id, new.community_id, new.user_id, s, 'skipped', new.user_id,
    jsonb_build_object('method', new.verification_method)) from unnest(array['register', 'verify-email', 'find-class', 'apply']) s;
  perform private.wf_mark('A-membership', 'membership', new.id, new.community_id, new.user_id, s, 'completed', new.verified_by,
    jsonb_build_object('method', new.verification_method)) from unnest(array['review', 'approve']) s;
  return null;
end $$;
create trigger wf_membership after insert or update of status on public.memberships
  for each row execute function private.wf_membership();

-- 'dashboard' completes when the member first opens their community dashboard (called by the app).
create function public.workflow_touch_dashboard(p_community_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); r record;
begin
  if not private.is_member(p_community_id) then return; end if;
  for r in select subject_type, subject_id from public.workflow_runs
           where workflow_id = 'A-membership' and user_id = v_uid and community_id = p_community_id and state = 'running' and current_step = 'dashboard'
  loop
    perform private.wf_mark('A-membership', r.subject_type, r.subject_id, p_community_id, v_uid, 'dashboard', 'completed', v_uid);
  end loop;
end $$;

---------------------------------------------------------------------------
-- B · Profile (one run per person)
---------------------------------------------------------------------------
create function private.wf_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_default jsonb := '{"full_name":"members","name_at_graduation":"members","headline":"members","about":"members","profession":"members","industry":"members","employer":"members","job_title":"members","linkedin_url":"members","website_url":"members","contact_email":"private","phone":"private"}'::jsonb;
begin
  perform private.wf_mark('B-profile', 'profile', new.id, null, new.id, 'create', 'completed', new.id);
  if nullif(trim(new.name_at_graduation), '') is not null then
    perform private.wf_mark('B-profile', 'profile', new.id, null, new.id, 'academic', 'completed', new.id);
  end if;
  if coalesce(nullif(trim(new.profession), ''), nullif(trim(new.employer), ''), nullif(trim(new.job_title), '')) is not null then
    perform private.wf_mark('B-profile', 'profile', new.id, null, new.id, 'career', 'completed', new.id);
  end if;
  if tg_op = 'UPDATE' and new.visibility is distinct from old.visibility or new.visibility <> v_default then
    perform private.wf_mark('B-profile', 'profile', new.id, null, new.id, 'privacy', 'completed', new.id);
  end if;
  if new.directory_listed and char_length(new.full_name) >= 2 and nullif(trim(new.headline), '') is not null
     and exists (select 1 from public.workflow_run_steps s join public.workflow_runs r on r.id = s.run_id
                 where r.workflow_id = 'B-profile' and r.subject_id = new.id and s.step_id = 'career') then
    perform private.wf_mark('B-profile', 'profile', new.id, null, new.id, 'publish', 'completed', new.id);
  end if;
  return null;
end $$;
create trigger wf_profile after insert or update on public.profiles for each row execute function private.wf_profile();

-- Saving the profile form counts as a privacy review even if defaults are kept.
create function public.workflow_mark_privacy_reviewed() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth();
begin
  perform private.wf_mark('B-profile', 'profile', v_uid, null, v_uid, 'privacy', 'completed', v_uid, '{"reviewed":true}'::jsonb);
end $$;

---------------------------------------------------------------------------
-- C · Business
---------------------------------------------------------------------------
create function private.wf_business() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'create', 'completed', new.owner_id);
  if cardinality(new.services) > 0 then
    perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'services', 'completed', new.owner_id);
  end if;
  if new.status in ('submitted', 'approved', 'rejected', 'suspended') then
    perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'submit', 'completed', new.owner_id);
    if new.status = 'submitted' then
      perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'review', 'waiting', null);
    end if;
  end if;
  if new.status = 'approved' then
    perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'review', 'completed', new.reviewed_by);
    perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'list', 'completed', new.reviewed_by);
  elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'review', 'denied', new.reviewed_by,
      jsonb_build_object('note', new.review_note));
  end if;
  -- Resubmission after rejection or edits returns the run to review.
  if tg_op = 'UPDATE' and new.status = 'submitted' and old.status in ('rejected', 'approved') then
    delete from public.workflow_run_steps s using public.workflow_runs r
     where s.run_id = r.id and r.workflow_id = 'C-business' and r.subject_id = new.id and s.step_id in ('review', 'list');
    perform private.wf_mark('C-business', 'business', new.id, new.community_id, new.owner_id, 'review', 'waiting', null);
  end if;
  return null;
end $$;
create trigger wf_business after insert or update on public.businesses for each row execute function private.wf_business();

---------------------------------------------------------------------------
-- D · Events
---------------------------------------------------------------------------
create function private.wf_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.wf_mark('D-events', 'event', new.id, new.community_id, new.created_by, 'create', 'completed', new.created_by);
  if new.status = 'published' then
    perform private.wf_mark('D-events', 'event', new.id, new.community_id, new.created_by, 'discover', 'completed', auth.uid());
  elsif new.status = 'cancelled' then
    perform private.wf_cancel('D-events', new.id);
  end if;
  return null;
end $$;
create trigger wf_event after insert or update of status on public.events for each row execute function private.wf_event();

create function private.wf_rsvp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = new.event_id;
  if new.status in ('going', 'maybe') then
    perform private.wf_mark('D-events', 'event', e.id, e.community_id, e.created_by, 'rsvp', 'completed', new.user_id);
  end if;
  if new.attended then
    perform private.wf_mark('D-events', 'event', e.id, e.community_id, e.created_by, 'attendance', 'completed', new.checked_in_by);
  end if;
  return null;
end $$;
create trigger wf_rsvp after insert or update on public.event_rsvps for each row execute function private.wf_rsvp();

---------------------------------------------------------------------------
-- E · Administration (one run per community)
---------------------------------------------------------------------------
create function private.wf_community() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' then
    perform private.wf_mark('E-administration', 'community', new.id, new.id, null, 'verify-community', 'completed', coalesce(new.verified_by, auth.uid()));
  end if;
  return null;
end $$;
create trigger wf_community after insert or update of status on public.class_communities for each row execute function private.wf_community();

create function private.wf_role_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role_key <> 'class_admin' or new.scope_type <> 'community' then return null; end if;
  if new.status = 'pending_approval' then
    perform private.wf_mark('E-administration', 'community', new.scope_id, new.scope_id, null, 'assign-admin', 'waiting', new.assigned_by);
  elsif new.status = 'active' then
    perform private.wf_mark('E-administration', 'community', new.scope_id, new.scope_id, null, 'assign-admin', 'completed', new.assigned_by,
      jsonb_build_object('admin', new.user_id));
  end if;
  return null;
end $$;
create trigger wf_role_assignment after insert or update of status on public.role_assignments for each row execute function private.wf_role_assignment();

-- 'manage' (handover) completes when an active Class Admin performs their first leadership action in the community.
create function private.wf_handover() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.scope_type = 'community' and new.actor_id is not null
     and new.action in ('membership.approved', 'membership.rejected', 'event.insert', 'announcement.published', 'invite_code.created',
                        'membership.invited', 'business.approved', 'role.assigned')
     and exists (select 1 from public.role_assignments ra where ra.user_id = new.actor_id and ra.role_key = 'class_admin'
                 and ra.scope_type = 'community' and ra.scope_id = new.scope_id and ra.status = 'active') then
    perform private.wf_mark('E-administration', 'community', new.scope_id, new.scope_id, null, 'manage', 'completed', new.actor_id,
      jsonb_build_object('first_action', new.action));
  end if;
  return null;
end $$;
create trigger wf_handover after insert on public.audit_logs for each row execute function private.wf_handover();

---------------------------------------------------------------------------
-- Scheduled automations: registry, run log, jobs
---------------------------------------------------------------------------
create table public.automation_jobs (
  key         text primary key check (key ~ '^[a-z_]+$'),
  name        text not null,
  description text not null,
  schedule    text not null,
  enabled     boolean not null default true
);
create table public.automation_runs (
  id          bigint generated always as identity primary key,
  job_key     text not null references public.automation_jobs (key) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  processed   int not null default 0,
  error       text,
  triggered_by uuid references auth.users (id) on delete set null
);
create index automation_runs_job_idx on public.automation_runs (job_key, started_at desc);

-- Idempotency markers for one-off reminders.
alter table public.membership_requests add column reminded_at timestamptz, add column escalated_at timestamptz;
alter table public.approval_requests  add column reminded_at timestamptz;
alter table public.businesses         add column review_reminded_at timestamptz;
alter table public.invite_codes       add column expiry_notified_at timestamptz;
create table public.automation_sent (
  kind       text not null,
  subject_id uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  sent_at    timestamptz not null default now(),
  primary key (kind, subject_id, user_id)
);

insert into public.automation_jobs (key, name, description, schedule) values
  ('event_reminders',       'Event reminders',          'Remind members who RSVPed going/maybe 24 hours before an event.',                       'every 15 minutes'),
  ('membership_sla',        'Membership review SLA',    'Remind reviewers about requests waiting 48h+; escalate to institution/platform at 7 days.', 'every 15 minutes'),
  ('approval_reminders',    'Approval reminders',       'Remind independent approvers about role approvals waiting 48h+.',                         'every 15 minutes'),
  ('business_review_sla',   'Business review SLA',      'Remind reviewers about listings waiting 72h+.',                                           'every 15 minutes'),
  ('dues_reminders',        'Dues reminders',           'Tell members dues are due within 7 days, and once when overdue, until paid.',             'every 15 minutes'),
  ('profile_nudges',        'Profile completion nudge', 'Nudge members verified 3+ days ago whose profile is incomplete (once).',                  'every 15 minutes'),
  ('invite_code_expiry',    'Invite code expiry',       'Warn code creators 3 days before an active code expires.',                                'every 15 minutes');

create function private.job_membership_sla() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in select mr.id, mr.community_id, c.name from public.membership_requests mr join public.class_communities c on c.id = mr.community_id
           where mr.status = 'pending' and mr.reminded_at is null and mr.created_at < now() - interval '48 hours' for update of mr skip locked loop
    perform private.notify_holders('membership.approve', 'community', r.community_id, 'automation.membership_sla',
      'Membership request waiting 2+ days', 'A classmate is waiting to join ' || r.name || '.', '/admin/approvals');
    update public.membership_requests set reminded_at = now() where id = r.id; n := n + 1;
  end loop;
  for r in select mr.id, mr.community_id, c.name, c.institution_id from public.membership_requests mr join public.class_communities c on c.id = mr.community_id
           where mr.status = 'pending' and mr.escalated_at is null and mr.created_at < now() - interval '7 days' for update of mr skip locked loop
    if r.institution_id is not null then
      perform private.notify_holders('membership.approve', 'institution', r.institution_id, 'automation.membership_escalation',
        'Escalation: request waiting 7+ days', r.name || ' has a membership request unanswered for a week.', '/admin/approvals', '{}', true);
    else
      perform private.notify_holders('membership.approve', 'platform', null, 'automation.membership_escalation',
        'Escalation: request waiting 7+ days', r.name || ' has a membership request unanswered for a week.', '/admin/approvals');
    end if;
    update public.membership_requests set escalated_at = now() where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;

create function private.job_approval_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in select * from public.approval_requests where status = 'pending' and reminded_at is null and created_at < now() - interval '48 hours'
           for update skip locked loop
    perform private.notify_holders('approval.decide', r.scope_type, r.scope_id, 'automation.approval_reminder',
      'Approval waiting 2+ days: ' || coalesce(r.payload ->> 'role_name', 'role change'), r.payload ->> 'scope_label', '/admin/approvals',
      array_remove(array[r.requested_by, r.target_user_id], null), true);
    update public.approval_requests set reminded_at = now() where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;

create function private.job_business_review_sla() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in select * from public.businesses where status = 'submitted' and review_reminded_at is null and submitted_at < now() - interval '72 hours'
           for update skip locked loop
    perform private.notify_holders('business.review', 'community', r.community_id, 'automation.business_review',
      'Business listing waiting 3+ days', r.name, '/admin/approvals', array[r.owner_id]);
    update public.businesses set review_reminded_at = now() where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;

create function private.job_dues_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in
    select p.id plan_id, p.community_id, p.name, p.due_date, p.amount_minor, m.user_id,
           case when p.due_date < current_date then 'dues.overdue' else 'dues.due_soon' end kind
    from public.dues_plans p
    join public.memberships m on m.community_id = p.community_id and m.status = 'active'
    where p.status = 'active' and p.due_date is not null and p.due_date <= current_date + 7
      and coalesce((select sum(d.amount_minor) from public.dues_payments d where d.plan_id = p.id and d.user_id = m.user_id and d.status in ('confirmed', 'pending')), 0) < p.amount_minor
  loop
    insert into public.automation_sent (kind, subject_id, user_id) values (r.kind, r.plan_id, r.user_id) on conflict do nothing;
    if found then
      perform private.notify(r.user_id, r.community_id, r.kind,
        case when r.kind = 'dues.overdue' then 'Dues overdue: ' else 'Dues due soon: ' end || r.name,
        'Due ' || to_char(r.due_date, 'DD Mon YYYY') || '. Pay and notify your treasurer from the Dues page.', '/app/dues');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create function private.job_profile_nudges() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in
    select distinct on (m.user_id) m.user_id, m.community_id from public.memberships m
    where m.status = 'active' and m.verified_at < now() - interval '3 days'
      and not exists (select 1 from public.workflow_runs w where w.workflow_id = 'B-profile' and w.subject_id = m.user_id and w.state = 'completed')
    order by m.user_id, m.verified_at
  loop
    insert into public.automation_sent (kind, subject_id, user_id) values ('profile.nudge', r.user_id, r.user_id) on conflict do nothing;
    if found then
      perform private.notify(r.user_id, r.community_id, 'automation.profile_nudge', 'Help classmates find you',
        'Add your headline and career details — it takes two minutes and you control who sees each field.', '/app/profile');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create function private.job_invite_code_expiry() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in select * from public.invite_codes where revoked_at is null and expiry_notified_at is null and expires_at is not null
           and expires_at between now() and now() + interval '3 days' and (max_uses is null or uses < max_uses) for update skip locked loop
    perform private.notify(r.created_by, r.community_id, 'automation.invite_expiry', 'Invitation code expiring: ' || r.code,
      coalesce(r.label, 'Untitled code') || ' expires ' || to_char(r.expires_at, 'DD Mon') || '. Create a new one if it is still in use.', '/admin/members');
    update public.invite_codes set expiry_notified_at = now() where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;

-- Runs one job with logging; failures are recorded, never raised (so one job can't block the others).
create function private.run_job(p_key text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_run bigint; v_n int := 0;
begin
  if not exists (select 1 from public.automation_jobs where key = p_key and enabled) then return 0; end if;
  insert into public.automation_runs (job_key, triggered_by) values (p_key, auth.uid()) returning id into v_run;
  begin
    v_n := case p_key
      when 'event_reminders'     then private.enqueue_event_reminders()
      when 'membership_sla'      then private.job_membership_sla()
      when 'approval_reminders'  then private.job_approval_reminders()
      when 'business_review_sla' then private.job_business_review_sla()
      when 'dues_reminders'      then private.job_dues_reminders()
      when 'profile_nudges'      then private.job_profile_nudges()
      when 'invite_code_expiry'  then private.job_invite_code_expiry()
    end;
    update public.automation_runs set status = 'succeeded', processed = coalesce(v_n, 0), finished_at = now() where id = v_run;
  exception when others then
    update public.automation_runs set status = 'failed', error = left(sqlerrm, 500), finished_at = now() where id = v_run;
  end;
  return coalesce(v_n, 0);
end $$;

create function private.run_all_automations() returns void
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  for k in select key from public.automation_jobs where enabled order by key loop perform private.run_job(k); end loop;
  delete from public.automation_runs where started_at < now() - interval '30 days';
end $$;

-- Platform operators can run jobs on demand (e.g. from Admin → Automations).
create function public.run_automations_now(p_job text default null)
returns table (job_key text, status text, processed int, error text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_auth();
  if not (private.has_permission('platform.settings') or private.has_permission('security.manage')) then perform private.deny(); end if;
  if p_job is null then perform private.run_all_automations(); else perform private.run_job(p_job); end if;
  return query select distinct on (r.job_key) r.job_key, r.status, r.processed, r.error from public.automation_runs r
    where (p_job is null or r.job_key = p_job) order by r.job_key, r.id desc;
end $$;

---------------------------------------------------------------------------
-- RLS & grants
---------------------------------------------------------------------------
alter table public.workflow_runs enable row level security;
alter table public.workflow_run_steps enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_sent enable row level security;
revoke all on public.workflow_runs, public.workflow_run_steps, public.automation_jobs, public.automation_runs, public.automation_sent from anon, authenticated;
grant select on public.workflow_runs, public.workflow_run_steps, public.automation_jobs, public.automation_runs to authenticated;

create policy workflow_runs_read on public.workflow_runs for select to authenticated
  using (user_id = (select auth.uid())
         or (community_id is not null and private.can('audit.view', community_id))
         or private.has_permission('audit.view'));
create policy workflow_steps_read on public.workflow_run_steps for select to authenticated
  using (exists (select 1 from public.workflow_runs r where r.id = run_id));  -- inherits workflow_runs RLS
create policy automation_jobs_read on public.automation_jobs for select to authenticated using (private.has_permission('audit.view'));
create policy automation_runs_read on public.automation_runs for select to authenticated using (private.has_permission('audit.view'));

revoke execute on function public.workflow_touch_dashboard(uuid), public.workflow_mark_privacy_reviewed(), public.run_automations_now(text) from public, anon;
grant execute on function public.workflow_touch_dashboard(uuid), public.workflow_mark_privacy_reviewed(), public.run_automations_now(text) to authenticated;
revoke execute on function private.wf_mark(text, text, uuid, uuid, uuid, text, text, uuid, jsonb), private.wf_cancel(text, uuid),
  private.run_job(text), private.run_all_automations(), private.job_membership_sla(), private.job_approval_reminders(),
  private.job_business_review_sla(), private.job_dues_reminders(), private.job_profile_nudges(), private.job_invite_code_expiry()
from public;
grant execute on function private.workflow_steps(text), private.workflow_gates(text) to authenticated, service_role;

---------------------------------------------------------------------------
-- Backfill runs from existing data (idempotent), then schedule if pg_cron is available.
---------------------------------------------------------------------------
update public.profiles set updated_at = updated_at;            -- fires wf_profile for every profile
do $$
declare r record;
begin
  for r in select * from public.membership_requests loop
    perform private.wf_mark('A-membership', 'membership_request', r.id, r.community_id, r.user_id, s, 'completed', r.user_id)
      from unnest(array['register', 'verify-email', 'find-class', 'apply']) s;
    if r.status = 'approved' then
      perform private.wf_mark('A-membership', 'membership_request', r.id, r.community_id, r.user_id, s, 'completed', r.reviewed_by) from unnest(array['review', 'approve']) s;
    elsif r.status = 'rejected' then
      perform private.wf_mark('A-membership', 'membership_request', r.id, r.community_id, r.user_id, 'review', 'denied', r.reviewed_by);
    elsif r.status = 'pending' then
      perform private.wf_mark('A-membership', 'membership_request', r.id, r.community_id, r.user_id, 'review', 'waiting', null);
    else perform private.wf_cancel('A-membership', r.id);
    end if;
  end loop;
  for r in select * from public.memberships where status = 'active' and verification_method <> 'request_review' loop
    perform private.wf_mark('A-membership', 'membership', r.id, r.community_id, r.user_id, s, 'skipped', r.user_id,
      jsonb_build_object('method', r.verification_method)) from unnest(array['register', 'verify-email', 'find-class', 'apply']) s;
    perform private.wf_mark('A-membership', 'membership', r.id, r.community_id, r.user_id, s, 'completed', r.verified_by,
      jsonb_build_object('method', r.verification_method)) from unnest(array['review', 'approve']) s;
  end loop;
  for r in select * from public.class_communities where status = 'active' loop
    perform private.wf_mark('E-administration', 'community', r.id, r.id, null, 'verify-community', 'completed', r.verified_by);
  end loop;
  update public.businesses set updated_at = updated_at;
  update public.events set status = status;

  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $c$select cron.schedule('alums-automations', '*/15 * * * *', 'select private.run_all_automations()')$c$;
  end if;
end $$;
