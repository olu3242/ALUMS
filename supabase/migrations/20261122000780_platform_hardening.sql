-- Gap analysis batch 1 (platform hardening).
-- 1) Index every single-column foreign key the performance advisor flagged (50). Cheap now, avoids
--    sequential scans on joins/cascades as classes grow.
create index if not exists albums_created_by_fkx on public.albums (created_by);
create index if not exists albums_event_id_fkx on public.albums (event_id);
create index if not exists announcements_author_id_fkx on public.announcements (author_id);
create index if not exists approval_requests_decided_by_fkx on public.approval_requests (decided_by);
create index if not exists approval_requests_requested_by_fkx on public.approval_requests (requested_by);
create index if not exists approval_requests_target_user_id_fkx on public.approval_requests (target_user_id);
create index if not exists automation_runs_triggered_by_fkx on public.automation_runs (triggered_by);
create index if not exists automation_sent_user_id_fkx on public.automation_sent (user_id);
create index if not exists businesses_category_id_fkx on public.businesses (category_id);
create index if not exists businesses_reviewed_by_fkx on public.businesses (reviewed_by);
create index if not exists class_communities_created_by_fkx on public.class_communities (created_by);
create index if not exists class_communities_department_id_fkx on public.class_communities (department_id);
create index if not exists class_communities_verified_by_fkx on public.class_communities (verified_by);
create index if not exists community_affiliations_decided_by_fkx on public.community_affiliations (decided_by);
create index if not exists community_affiliations_requested_by_fkx on public.community_affiliations (requested_by);
create index if not exists community_features_updated_by_fkx on public.community_features (updated_by);
create index if not exists community_requests_requested_by_fkx on public.community_requests (requested_by);
create index if not exists community_requests_resolved_community_id_fkx on public.community_requests (resolved_community_id);
create index if not exists community_requests_reviewed_by_fkx on public.community_requests (reviewed_by);
create index if not exists connections_requester_id_fkx on public.connections (requester_id);
create index if not exists dues_payments_community_id_fkx on public.dues_payments (community_id);
create index if not exists dues_payments_decided_by_fkx on public.dues_payments (decided_by);
create index if not exists dues_payments_submitted_by_fkx on public.dues_payments (submitted_by);
create index if not exists dues_plans_created_by_fkx on public.dues_plans (created_by);
create index if not exists event_rsvps_checked_in_by_fkx on public.event_rsvps (checked_in_by);
create index if not exists event_rsvps_user_id_fkx on public.event_rsvps (user_id);
create index if not exists events_created_by_fkx on public.events (created_by);
create index if not exists institution_links_created_by_fkx on public.institution_links (created_by);
create index if not exists institution_posts_author_id_fkx on public.institution_posts (author_id);
create index if not exists institutions_created_by_fkx on public.institutions (created_by);
create index if not exists institutions_verified_by_fkx on public.institutions (verified_by);
create index if not exists invitations_accepted_by_fkx on public.invitations (accepted_by);
create index if not exists invitations_invited_by_fkx on public.invitations (invited_by);
create index if not exists invite_code_redemptions_user_id_fkx on public.invite_code_redemptions (user_id);
create index if not exists invite_codes_created_by_fkx on public.invite_codes (created_by);
create index if not exists media_assets_community_id_fkx on public.media_assets (community_id);
create index if not exists media_assets_uploader_id_fkx on public.media_assets (uploader_id);
create index if not exists membership_requests_reviewed_by_fkx on public.membership_requests (reviewed_by);
create index if not exists membership_requests_user_id_fkx on public.membership_requests (user_id);
create index if not exists memberships_verified_by_fkx on public.memberships (verified_by);
create index if not exists moderation_reports_reporter_id_fkx on public.moderation_reports (reporter_id);
create index if not exists moderation_reports_resolved_by_fkx on public.moderation_reports (resolved_by);
create index if not exists notifications_community_id_fkx on public.notifications (community_id);
create index if not exists platform_settings_updated_by_fkx on public.platform_settings (updated_by);
create index if not exists role_assignments_assigned_by_fkx on public.role_assignments (assigned_by);
create index if not exists role_assignments_revoked_by_fkx on public.role_assignments (revoked_by);
create index if not exists role_assignments_role_key_fkx on public.role_assignments (role_key);
create index if not exists role_conflicts_role_b_fkx on public.role_conflicts (role_b);
create index if not exists role_permissions_permission_key_fkx on public.role_permissions (permission_key);
create index if not exists workflow_run_steps_actor_id_fkx on public.workflow_run_steps (actor_id);

-- 2) Class modules switched off are enforced in the database, not just hidden in the UI:
--    new rows in an off module are refused for everyone (RPCs included). Existing rows stay manageable.
create function private.enforce_feature() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_c uuid; v_f text := tg_argv[0];
begin
  if tg_table_name = 'event_rsvps' then
    select community_id into v_c from public.events where id = new.event_id;
  else
    v_c := (to_jsonb(new) ->> 'community_id')::uuid;
  end if;
  if v_c is not null and not private.feature_enabled(v_c, v_f) then
    raise exception 'this section is turned off for this class' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger businesses_feature    before insert on public.businesses    for each row execute function private.enforce_feature('businesses');
create trigger events_feature        before insert on public.events        for each row execute function private.enforce_feature('events');
create trigger event_rsvps_feature   before insert on public.event_rsvps   for each row execute function private.enforce_feature('events');
create trigger announcements_feature before insert on public.announcements for each row execute function private.enforce_feature('announcements');
create trigger albums_feature        before insert on public.albums        for each row execute function private.enforce_feature('gallery');
create trigger media_assets_feature  before insert on public.media_assets  for each row execute function private.enforce_feature('gallery');
create trigger dues_plans_feature    before insert on public.dues_plans    for each row execute function private.enforce_feature('dues');
create trigger dues_payments_feature before insert on public.dues_payments for each row execute function private.enforce_feature('dues');

-- 3) Data portability: a member can download everything ALUMS holds about them (own rows only). Audited.
create function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v jsonb;
begin
  select jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at, 'email_confirmed_at', u.email_confirmed_at,
                                          'last_sign_in_at', u.last_sign_in_at) from auth.users u where u.id = v_uid),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'location', (select to_jsonb(l) from public.locations l where l.user_id = v_uid),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('class', c.name, 'status', m.status, 'verification_method', m.verification_method,
                                          'verified_at', m.verified_at) order by m.verified_at) from public.memberships m
                             join public.class_communities c on c.id = m.community_id where m.user_id = v_uid), '[]'),
    'membership_requests', coalesce((select jsonb_agg(jsonb_build_object('class', c.name, 'status', r.status, 'created_at', r.created_at) order by r.created_at)
                             from public.membership_requests r join public.class_communities c on c.id = r.community_id where r.user_id = v_uid), '[]'),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', ra.role_key, 'scope', ra.scope_type, 'status', ra.status)) from public.role_assignments ra
                             where ra.user_id = v_uid), '[]'),
    'connections', coalesce((select jsonb_agg(jsonb_build_object('status', x.status, 'created_at', x.created_at,
                                          'direction', case when x.requester_id = v_uid then 'sent' else 'received' end))
                             from public.connections x where v_uid in (x.requester_id, x.addressee_id)), '[]'),
    'businesses', coalesce((select jsonb_agg(to_jsonb(b) - 'reviewed_by') from public.businesses b where b.owner_id = v_uid), '[]'),
    'event_rsvps', coalesce((select jsonb_agg(jsonb_build_object('event', e.title, 'starts_at', e.starts_at, 'status', r.status, 'attended', r.attended))
                             from public.event_rsvps r join public.events e on e.id = r.event_id where r.user_id = v_uid), '[]'),
    'dues_payments', coalesce((select jsonb_agg(jsonb_build_object('plan', pl.name, 'amount_minor', d.amount_minor, 'currency', d.currency,
                                          'status', d.status, 'created_at', d.created_at)) from public.dues_payments d
                             join public.dues_plans pl on pl.id = d.plan_id where d.user_id = v_uid), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('title', n.title, 'created_at', n.created_at, 'read_at', n.read_at) order by n.created_at desc)
                             from (select * from public.notifications where user_id = v_uid order by created_at desc limit 500) n), '[]')
  ) into v;
  perform private.audit('account.data_exported', 'platform', null, 'user', v_uid, '{}'::jsonb);
  return v;
end $$;
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;
