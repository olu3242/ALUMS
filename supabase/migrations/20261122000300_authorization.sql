-- Authorization: helper predicates, RLS policies, least-privilege grants, storage.
-- Principles: authorization is resolved live from tables (never from JWT role claims or user metadata);
-- reads go through RLS; privileged writes go through SECURITY DEFINER RPCs (0400) that audit.

---------------------------------------------------------------------------
-- Helper predicates (SECURITY DEFINER to avoid RLS recursion; caller-scoped via auth.uid())
---------------------------------------------------------------------------
create function private.is_member(p_community_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.community_id = p_community_id and m.user_id = (select auth.uid()) and m.status = 'active')
$$;

create function private.shares_community(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on b.community_id = a.community_id and b.status = 'active'
    where a.user_id = (select auth.uid()) and a.status = 'active' and b.user_id = p_other)
$$;

create function private.is_connected(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = (select auth.uid()) and c.addressee_id = p_other)
        or (c.addressee_id = (select auth.uid()) and c.requester_id = p_other)))
$$;

-- Active assignments that apply to a scope (platform ⊇ institution ⊇ community).
create function private.applicable_assignments(p_user uuid, p_scope_type public.scope_type, p_scope_id uuid)
returns setof public.role_assignments
language sql stable security definer set search_path = '' as $$
  select ra.* from public.role_assignments ra
  where ra.user_id = p_user and ra.status = 'active'
    and (ra.expires_at is null or ra.expires_at > now())
    and (
      ra.scope_type = 'platform'
      or (ra.scope_type = p_scope_type and ra.scope_id = p_scope_id)
      or (p_scope_type = 'community' and ra.scope_type = 'institution'
          and ra.scope_id = (select c.institution_id from public.class_communities c where c.id = p_scope_id)))
    -- community roles lapse when the holder is no longer an active member
    and (ra.scope_type <> 'community' or exists (
      select 1 from public.memberships m
      where m.community_id = ra.scope_id and m.user_id = ra.user_id and m.status = 'active'))
$$;

create function private.has_permission(p_perm text, p_scope_type public.scope_type default 'platform', p_scope_id uuid default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from private.applicable_assignments((select auth.uid()), p_scope_type, p_scope_id) ra
    join public.role_permissions rp on rp.role_key = ra.role_key and rp.permission_key = p_perm)
$$;

create function private.can(p_perm text, p_community_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission(p_perm, 'community', p_community_id)
$$;

create function private.actor_rank(p_user uuid, p_scope_type public.scope_type, p_scope_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(max(r.rank), 0)
  from private.applicable_assignments(p_user, p_scope_type, p_scope_id) ra
  join public.roles r on r.key = ra.role_key
$$;

create function private.require_auth() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'authentication required' using errcode = '28000'; end if;
  return v;
end $$;

-- MFA (AAL2) for privileged mutations, driven by platform setting.
create function private.require_mfa() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select value::text from public.platform_settings where key = 'security.require_mfa_for_privileged'), 'true') = 'true'
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'multi-factor authentication required for this action' using errcode = '42501', hint = 'mfa_required';
  end if;
end $$;

-- Field masking for profiles. Hierarchy: everyone ⊇ members ⊇ connections ⊇ private.
-- "everyone" = any signed-in ALUMS user who can reach the profile (reach is checked by the calling RPC).
create function private.field_level(p_visibility jsonb, p_field text) returns public.visibility_level
language sql immutable set search_path = '' as $$
  select coalesce((p_visibility ->> p_field)::public.visibility_level, 'private'::public.visibility_level)
$$;

create function private.visible(p_level public.visibility_level, p_is_self boolean, p_shares boolean, p_connected boolean)
returns boolean
language sql immutable set search_path = '' as $$
  select p_is_self or case p_level
    when 'everyone' then true
    when 'members' then p_shares or p_connected
    when 'connections' then p_connected
    else false end
$$;

---------------------------------------------------------------------------
-- Least-privilege grants. Supabase grants ALL to anon/authenticated by default; reset and grant explicitly.
---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Anonymous visitors get only public identity columns (no creator/verifier ids).
grant select (id, name, slug, country, city, website_url, status) on public.institutions to anon;
grant select (id, slug, name, institution_id, department_name, graduation_year, description, status, is_founding) on public.class_communities to anon;
grant select on public.business_categories to anon;
grant select on public.institutions, public.departments, public.class_communities, public.business_categories,
  public.memberships, public.membership_requests, public.invitations, public.community_requests,
  public.permissions, public.roles, public.role_permissions, public.role_conflicts, public.role_assignments,
  public.approval_requests, public.platform_settings, public.profiles, public.locations, public.connections,
  public.businesses, public.events, public.event_rsvps, public.announcements, public.albums, public.media_assets,
  public.notifications, public.moderation_reports, public.audit_logs
  to authenticated;

grant update (full_name, name_at_graduation, headline, about, profession, industry, employer, job_title, contact_email,
              phone, linkedin_url, website_url, open_to_mentoring, directory_listed, visibility)
  on public.profiles to authenticated;
grant update (country, city, share_level, consent_at) on public.locations to authenticated;
grant insert (addressee_id) on public.connections to authenticated;
grant update (status, responded_at) on public.connections to authenticated;
grant delete on public.connections to authenticated;
grant insert (community_id, category_id, name, description, services, website_url, contact_email, phone, country, city)
  on public.businesses to authenticated;
grant update (category_id, name, description, services, website_url, contact_email, phone, country, city)
  on public.businesses to authenticated;
grant delete on public.businesses to authenticated;
grant insert (community_id, title, description, starts_at, ends_at, timezone, venue, is_virtual, meeting_url, capacity, status)
  on public.events to authenticated;
grant update (title, description, starts_at, ends_at, timezone, venue, is_virtual, meeting_url, capacity, status)
  on public.events to authenticated;
grant delete on public.events to authenticated;
grant insert (event_id, status) on public.event_rsvps to authenticated;
grant update (status) on public.event_rsvps to authenticated;
grant delete on public.event_rsvps to authenticated;
grant insert (community_id, title, body, is_pinned) on public.announcements to authenticated;
grant update (title, body, is_pinned) on public.announcements to authenticated;
grant delete on public.announcements to authenticated;
grant insert (community_id, event_id, title, description) on public.albums to authenticated;
grant update (title, description) on public.albums to authenticated;
grant delete on public.albums to authenticated;
grant insert (community_id, album_id, storage_path, mime_type, bytes, caption) on public.media_assets to authenticated;
grant update (caption, status) on public.media_assets to authenticated;
grant delete on public.media_assets to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (community_id, target_type, target_id, reason) on public.moderation_reports to authenticated;

---------------------------------------------------------------------------
-- RLS
---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Catalog: readable configuration
create policy catalog_read on public.permissions      for select to authenticated using (true);
create policy catalog_read on public.roles            for select to authenticated using (true);
create policy catalog_read on public.role_permissions for select to authenticated using (true);
create policy catalog_read on public.role_conflicts   for select to authenticated using (true);
create policy catalog_read on public.business_categories for select to anon, authenticated using (true);

create policy settings_read on public.platform_settings for select to authenticated
  using (private.has_permission('platform.settings') or private.has_permission('security.manage'));

-- Tenancy
create policy institutions_read on public.institutions for select to anon, authenticated
  using (status = 'verified' or private.has_permission('institution.manage')
         or private.has_permission('community.view_admin', 'institution', id));

create policy departments_read on public.departments for select to authenticated using (true);

create policy communities_read on public.class_communities for select to anon, authenticated
  using (status = 'active' or private.is_member(id) or private.can('community.view_admin', id));

create policy memberships_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.can('member.view', community_id));

create policy membership_requests_read on public.membership_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.can('membership.review', community_id));

create policy invitations_read on public.invitations for select to authenticated
  using (private.can('member.invite', community_id));

create policy community_requests_read on public.community_requests for select to authenticated
  using (requested_by = (select auth.uid()) or private.has_permission('community.create'));

-- RBAC state
create policy role_assignments_read on public.role_assignments for select to authenticated
  using (user_id = (select auth.uid())
         or private.has_permission('role.assign', scope_type, scope_id)
         or (scope_type = 'community' and private.can('member.view', scope_id)));

create policy approval_requests_read on public.approval_requests for select to authenticated
  using (requested_by = (select auth.uid()) or target_user_id = (select auth.uid())
         or private.has_permission('approval.decide', scope_type, scope_id));

-- People: base tables are self-only; others read masked data through RPCs.
create policy profiles_self_read   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy locations_self_read   on public.locations for select to authenticated using (user_id = (select auth.uid()));
create policy locations_self_update on public.locations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy connections_read on public.connections for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
create policy connections_request on public.connections for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and private.shares_community(addressee_id));
create policy connections_respond on public.connections for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status in ('accepted', 'declined'));
create policy connections_remove on public.connections for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
alter table public.connections alter column requester_id set default auth.uid();

-- Businesses
create policy businesses_read on public.businesses for select to authenticated
  using (owner_id = (select auth.uid())
         or (status = 'approved' and private.is_member(community_id))
         or private.can('business.review', community_id));
create policy businesses_create on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft' and private.is_member(community_id));
create policy businesses_edit on public.businesses for update to authenticated
  using (owner_id = (select auth.uid()) and status <> 'suspended' and private.is_member(community_id))
  with check (owner_id = (select auth.uid()));
create policy businesses_delete on public.businesses for delete to authenticated
  using (owner_id = (select auth.uid()) and status in ('draft', 'rejected'));

-- Events
create policy events_read on public.events for select to authenticated
  using ((status <> 'draft' and private.is_member(community_id)) or private.can('event.manage', community_id));
create policy events_create on public.events for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can('event.create', community_id));
create policy events_edit on public.events for update to authenticated
  using (private.can('event.manage', community_id) or (created_by = (select auth.uid()) and private.can('event.create', community_id)))
  with check (private.can('event.manage', community_id) or private.can('event.create', community_id));
create policy events_delete on public.events for delete to authenticated
  using (status = 'draft' and private.can('event.manage', community_id));

create function private.event_community(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select community_id from public.events where id = p_event
$$;
create function private.event_open_for_rsvp(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.status = 'published'
                 and coalesce(e.ends_at, e.starts_at) > now() and private.is_member(e.community_id))
$$;

create policy rsvps_read on public.event_rsvps for select to authenticated
  using (user_id = (select auth.uid()) or private.can('event.manage', private.event_community(event_id)));
create policy rsvps_create on public.event_rsvps for insert to authenticated
  with check (user_id = (select auth.uid()) and private.event_open_for_rsvp(event_id));
create policy rsvps_update on public.event_rsvps for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.event_open_for_rsvp(event_id));
create policy rsvps_delete on public.event_rsvps for delete to authenticated using (user_id = (select auth.uid()));

-- Announcements
create policy announcements_read on public.announcements for select to authenticated
  using (private.is_member(community_id) or private.can('announcement.publish', community_id));
create policy announcements_write on public.announcements for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can('announcement.publish', community_id));
create policy announcements_edit on public.announcements for update to authenticated
  using (private.can('announcement.publish', community_id)) with check (private.can('announcement.publish', community_id));
create policy announcements_delete on public.announcements for delete to authenticated
  using (private.can('announcement.publish', community_id));

-- Gallery
create policy albums_read on public.albums for select to authenticated
  using (private.is_member(community_id) or private.can('gallery.manage', community_id));
create policy albums_create on public.albums for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can('gallery.manage', community_id));
create policy albums_edit on public.albums for update to authenticated
  using (private.can('gallery.manage', community_id)) with check (private.can('gallery.manage', community_id));
create policy albums_delete on public.albums for delete to authenticated
  using (private.can('gallery.manage', community_id));

create policy media_read on public.media_assets for select to authenticated
  using ((status = 'published' and private.is_member(community_id)) or uploader_id = (select auth.uid())
         or private.can('gallery.manage', community_id));
create policy media_create on public.media_assets for insert to authenticated
  with check (uploader_id = (select auth.uid()) and status = 'published' and private.is_member(community_id));
create policy media_edit on public.media_assets for update to authenticated
  using (private.can('gallery.manage', community_id) or (uploader_id = (select auth.uid()) and status = 'published'))
  with check (private.can('gallery.manage', community_id) or (uploader_id = (select auth.uid()) and status = 'published'));
create policy media_delete on public.media_assets for delete to authenticated
  using (uploader_id = (select auth.uid()) or private.can('gallery.manage', community_id));

-- Notifications
create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Moderation
create policy reports_read on public.moderation_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.can('moderation.resolve', community_id));
create policy reports_create on public.moderation_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and private.is_member(community_id));

-- Audit
create policy audit_read on public.audit_logs for select to authenticated
  using (private.has_permission('audit.view')
         or (scope_type <> 'platform' and private.has_permission('audit.view', scope_type, scope_id)));

---------------------------------------------------------------------------
-- Storage: private bucket, objects stored under <community_id>/<album_id>/<file>
---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy community_media_read on storage.objects for select to authenticated
  using (bucket_id = 'community-media' and (
    private.is_member(private.try_uuid((storage.foldername(name))[1]))
    or private.can('gallery.manage', private.try_uuid((storage.foldername(name))[1]))));
create policy community_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'community-media' and private.is_member(private.try_uuid((storage.foldername(name))[1])));
create policy community_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'community-media' and (owner = (select auth.uid())
    or private.can('gallery.manage', private.try_uuid((storage.foldername(name))[1]))));

---------------------------------------------------------------------------
-- Function privileges: helpers callable from policies; audit internals locked.
---------------------------------------------------------------------------
revoke execute on all functions in schema private from public;
grant execute on function
  private.is_member(uuid), private.shares_community(uuid), private.is_connected(uuid),
  private.has_permission(text, public.scope_type, uuid), private.can(text, uuid),
  private.event_community(uuid), private.event_open_for_rsvp(uuid), private.try_uuid(text),
  private.field_level(jsonb, text), private.visible(public.visibility_level, boolean, boolean, boolean),
  private.valid_visibility(jsonb), private.like_pattern(text), private.slugify(text)
  to anon, authenticated, service_role;
