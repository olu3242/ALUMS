-- Workflow RPCs (Workflows A–E). Each RPC: authenticates, authorizes live against tables,
-- validates state transitions, writes a semantic audit event, and notifies affected users.

---------------------------------------------------------------------------
-- Notification helpers
---------------------------------------------------------------------------
create function private.notify(p_user uuid, p_community uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, community_id, kind, title, body, link)
  values (p_user, p_community, p_kind, left(p_title, 200), left(p_body, 1000), p_link);
$$;

-- Notify holders of a permission that applies to a scope (optionally including platform holders).
create function private.notify_holders(
  p_perm text, p_scope_type public.scope_type, p_scope_id uuid, p_kind text, p_title text, p_body text, p_link text,
  p_exclude uuid[] default '{}', p_include_platform boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, community_id, kind, title, body, link)
  select distinct ra.user_id, case when p_scope_type = 'community' then p_scope_id end, p_kind, p_title, p_body, p_link
  from public.role_assignments ra
  join public.role_permissions rp on rp.role_key = ra.role_key and rp.permission_key = p_perm
  where ra.status = 'active' and (ra.expires_at is null or ra.expires_at > now())
    and not (ra.user_id = any (coalesce(p_exclude, '{}')))
    and (
      (p_include_platform and ra.scope_type = 'platform')
      or (p_scope_type = 'platform' and ra.scope_type = 'platform')
      or (p_scope_type = 'institution' and ra.scope_type = 'institution' and ra.scope_id = p_scope_id)
      or (p_scope_type = 'community' and ra.scope_type = 'community' and ra.scope_id = p_scope_id
          and exists (select 1 from public.memberships m where m.community_id = p_scope_id and m.user_id = ra.user_id and m.status = 'active'))
      or (p_scope_type = 'community' and ra.scope_type = 'institution'
          and ra.scope_id = (select c.institution_id from public.class_communities c where c.id = p_scope_id)));
$$;

create function private.deny(p_message text default 'not authorized') returns void
language plpgsql set search_path = '' as $$
begin raise exception '%', p_message using errcode = '42501'; end $$;

---------------------------------------------------------------------------
-- Discovery (public)
---------------------------------------------------------------------------
create function public.search_communities(
  p_institution text default null, p_department text default null, p_year int default null, p_limit int default 24)
returns table (id uuid, slug text, name text, department_name text, graduation_year int,
               institution_name text, institution_verified boolean, is_founding boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.slug, c.name, c.department_name, c.graduation_year, i.name, (i.status = 'verified'), c.is_founding
  from public.class_communities c
  left join public.institutions i on i.id = c.institution_id and i.status = 'verified'
  where c.status = 'active'
    and (nullif(trim(p_institution), '') is null or i.name ilike private.like_pattern(trim(p_institution)))
    and (nullif(trim(p_department), '') is null or c.department_name ilike private.like_pattern(trim(p_department)))
    and (p_year is null or c.graduation_year = p_year)
  order by c.is_founding desc, c.graduation_year desc, c.name
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

create function public.request_community(p_institution_name text, p_department_name text, p_graduation_year int, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid;
begin
  if (select count(*) from public.community_requests where requested_by = v_uid and status = 'pending') >= 3 then
    raise exception 'you already have 3 pending community requests' using errcode = 'P0001';
  end if;
  insert into public.community_requests (requested_by, institution_name, department_name, graduation_year, note)
  values (v_uid, trim(p_institution_name), trim(p_department_name), p_graduation_year, nullif(trim(p_note), ''))
  returning id into v_id;
  perform private.audit('community.requested', 'platform', null, 'community_request', v_id,
    jsonb_build_object('institution', p_institution_name, 'department', p_department_name, 'year', p_graduation_year));
  perform private.notify_holders('community.create', 'platform', null, 'community.requested', 'New class community request',
    p_department_name || ' — Class of ' || p_graduation_year || ' · ' || p_institution_name, '/admin/communities', array[v_uid]);
  return v_id;
end $$;

---------------------------------------------------------------------------
-- Workflow A: Membership
---------------------------------------------------------------------------
create function public.apply_for_membership(
  p_community_id uuid, p_name_at_graduation text, p_student_identifier text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid; v_status public.membership_status; v_name text;
begin
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'verify your email before applying' using errcode = '42501', hint = 'email_unverified';
  end if;
  select name into v_name from public.class_communities where id = p_community_id and status = 'active';
  if v_name is null then raise exception 'community not found or not accepting members' using errcode = 'P0002'; end if;
  select status into v_status from public.memberships where community_id = p_community_id and user_id = v_uid;
  if v_status = 'active' then raise exception 'you are already a verified member' using errcode = 'P0001'; end if;
  if v_status = 'suspended' then raise exception 'your membership is suspended; contact the class admins' using errcode = '42501'; end if;
  if exists (select 1 from public.membership_requests where community_id = p_community_id and user_id = v_uid and status = 'pending') then
    raise exception 'you already have a pending request for this community' using errcode = 'P0001';
  end if;
  if (select count(*) from public.membership_requests where user_id = v_uid and status = 'pending') >= 10 then
    raise exception 'too many pending requests' using errcode = 'P0001';
  end if;

  insert into public.membership_requests (community_id, user_id, name_at_graduation, student_identifier, note)
  values (p_community_id, v_uid, trim(p_name_at_graduation), nullif(trim(p_student_identifier), ''), nullif(trim(p_note), ''))
  returning id into v_id;

  perform private.audit('membership.requested', 'community', p_community_id, 'membership_request', v_id, '{}'::jsonb);
  perform private.notify_holders('membership.review', 'community', p_community_id, 'membership.requested',
    'New membership request', trim(p_name_at_graduation) || ' applied to join ' || v_name, '/admin/approvals', array[v_uid]);
  return v_id;
end $$;

create function public.withdraw_membership_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_cid uuid;
begin
  update public.membership_requests set status = 'withdrawn'
  where id = p_request_id and user_id = v_uid and status = 'pending'
  returning community_id into v_cid;
  if v_cid is null then raise exception 'pending request not found' using errcode = 'P0002'; end if;
  perform private.audit('membership.withdrawn', 'community', v_cid, 'membership_request', p_request_id, '{}'::jsonb);
end $$;

create function public.review_membership_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); r public.membership_requests; v_name text;
begin
  select * into r from public.membership_requests where id = p_request_id for update;
  if r.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if not private.can('membership.approve', r.community_id) then perform private.deny(); end if;
  if r.status <> 'pending' then raise exception 'request already %', r.status using errcode = 'P0001'; end if;
  if r.user_id = v_uid then perform private.deny('you cannot review your own request'); end if;
  select name into v_name from public.class_communities where id = r.community_id;

  update public.membership_requests
     set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
         reviewed_by = v_uid, reviewed_at = now(), decision_note = nullif(trim(p_note), '')
   where id = r.id;

  if p_approve then
    insert into public.memberships (community_id, user_id, status, verification_method, verified_at, verified_by)
    values (r.community_id, r.user_id, 'active', 'request_review', now(), v_uid)
    on conflict (community_id, user_id) do update
      set status = 'active', verification_method = 'request_review', verified_at = now(), verified_by = v_uid
      where public.memberships.status = 'left';
    perform private.audit('membership.approved', 'community', r.community_id, 'user', r.user_id, jsonb_build_object('request_id', r.id));
    perform private.notify(r.user_id, r.community_id, 'membership.approved', 'Welcome to ' || v_name,
      'Your membership has been verified.', '/app/dashboard');
  else
    perform private.audit('membership.rejected', 'community', r.community_id, 'user', r.user_id, jsonb_build_object('request_id', r.id));
    perform private.notify(r.user_id, r.community_id, 'membership.rejected', 'Membership request update',
      'Your request to join ' || v_name || ' was not approved.' || coalesce(' Note: ' || nullif(trim(p_note), ''), ''), '/app/my-classes');
  end if;
end $$;

create function private.revoke_community_roles(p_user uuid, p_community uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.role_assignments set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), reason = p_reason
  where user_id = p_user and scope_type = 'community' and scope_id = p_community and status in ('active', 'pending_approval');
$$;

create function public.set_membership_status(p_membership_id uuid, p_status public.membership_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); m public.memberships;
begin
  select * into m from public.memberships where id = p_membership_id for update;
  if m.id is null then raise exception 'membership not found' using errcode = 'P0002'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'invalid status' using errcode = '22023'; end if;
  if not private.can('member.suspend', m.community_id) then perform private.deny(); end if;
  if m.user_id = v_uid then perform private.deny('you cannot change your own membership status'); end if;
  if private.actor_rank(m.user_id, 'community', m.community_id) >= private.actor_rank(v_uid, 'community', m.community_id) then
    perform private.deny('you cannot change the status of an equal or higher-ranked leader');
  end if;
  update public.memberships set status = p_status where id = m.id;
  if p_status = 'suspended' then perform private.revoke_community_roles(m.user_id, m.community_id, 'membership suspended'); end if;
  perform private.audit(case when p_status = 'suspended' then 'membership.suspended' else 'membership.reinstated' end,
    'community', m.community_id, 'user', m.user_id, jsonb_build_object('reason', p_reason));
  perform private.notify(m.user_id, m.community_id, 'membership.status', 'Membership ' || p_status::text,
    coalesce(p_reason, 'Your membership status changed.'), '/app/my-classes');
end $$;

create function public.leave_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth();
begin
  update public.memberships set status = 'left' where community_id = p_community_id and user_id = v_uid and status = 'active';
  if not found then raise exception 'active membership not found' using errcode = 'P0002'; end if;
  perform private.revoke_community_roles(v_uid, p_community_id, 'member left community');
  perform private.audit('membership.left', 'community', p_community_id, 'user', v_uid, '{}'::jsonb);
end $$;

create function public.create_invitation(p_community_id uuid, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_token text; v_id uuid; v_email text := lower(trim(p_email));
begin
  if not private.can('member.invite', p_community_id) then perform private.deny(); end if;
  if (select count(*) from public.invitations where invited_by = v_uid and created_at > now() - interval '1 day') >= 50 then
    raise exception 'daily invitation limit reached' using errcode = 'P0001';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.invitations (community_id, email, token_hash, invited_by)
  values (p_community_id, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid)
  returning id into v_id;
  perform private.audit('membership.invited', 'community', p_community_id, 'invitation', v_id, jsonb_build_object('email', v_email));
  return v_token; -- shown once; only the hash is stored
end $$;

create function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); i public.invitations; v_email text;
begin
  select * into i from public.invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if i.id is null or i.accepted_at is not null or i.revoked_at is not null or i.expires_at < now() then
    raise exception 'invitation is invalid or expired' using errcode = 'P0002';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is distinct from i.email then perform private.deny('this invitation was issued to a different email address'); end if;
  if exists (select 1 from public.memberships where community_id = i.community_id and user_id = v_uid and status = 'suspended') then
    perform private.deny('your membership is suspended');
  end if;
  insert into public.memberships (community_id, user_id, status, verification_method, verified_at, verified_by)
  values (i.community_id, v_uid, 'active', 'invitation', now(), i.invited_by)
  on conflict (community_id, user_id) do update set status = 'active', verification_method = 'invitation',
    verified_at = now(), verified_by = i.invited_by where public.memberships.status = 'left';
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = i.id;
  update public.membership_requests set status = 'withdrawn'
   where community_id = i.community_id and user_id = v_uid and status = 'pending';
  perform private.audit('membership.invitation_accepted', 'community', i.community_id, 'user', v_uid, jsonb_build_object('invitation_id', i.id));
  return i.community_id;
end $$;

---------------------------------------------------------------------------
-- Workflow B: Profile (read side; writes are self-only via RLS + column grants)
---------------------------------------------------------------------------
create function public.community_directory(
  p_community_id uuid default null, p_search text default null, p_institution_id uuid default null,
  p_graduation_year int default null, p_department text default null, p_profession text default null,
  p_industry text default null, p_country text default null, p_city text default null,
  p_business_owner boolean default null, p_limit int default 48, p_offset int default 0)
returns table (user_id uuid, full_name text, headline text, profession text, industry text, employer text,
               job_title text, country text, city text, is_business_owner boolean, open_to_mentoring boolean,
               community_ids uuid[], total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := private.require_auth();
begin
  if p_community_id is not null and not private.is_member(p_community_id) then
    perform private.deny('you are not a verified member of this community');
  end if;
  return query
  with scope as (
    select c.id from public.class_communities c
    join public.memberships me on me.community_id = c.id and me.user_id = v_uid and me.status = 'active'
    where (p_community_id is null or c.id = p_community_id)
      and (p_institution_id is null or c.institution_id = p_institution_id)
      and (p_graduation_year is null or c.graduation_year = p_graduation_year)
      and (nullif(trim(p_department), '') is null or lower(c.department_name) = lower(trim(p_department)))
  ), people as (
    select m.user_id as uid, array_agg(distinct m.community_id) as cids
    from public.memberships m join scope s on s.id = m.community_id
    where m.status = 'active' group by m.user_id
  ), masked as (
    select p.id as uid, pp.cids, v.conn,
      case when private.visible(private.field_level(p.visibility, 'full_name'),  p.id = v_uid, true, v.conn) then p.full_name end as full_name,
      case when private.visible(private.field_level(p.visibility, 'headline'),   p.id = v_uid, true, v.conn) then p.headline end as headline,
      case when private.visible(private.field_level(p.visibility, 'profession'), p.id = v_uid, true, v.conn) then p.profession end as profession,
      case when private.visible(private.field_level(p.visibility, 'industry'),   p.id = v_uid, true, v.conn) then p.industry end as industry,
      case when private.visible(private.field_level(p.visibility, 'employer'),   p.id = v_uid, true, v.conn) then p.employer end as employer,
      case when private.visible(private.field_level(p.visibility, 'job_title'),  p.id = v_uid, true, v.conn) then p.job_title end as job_title,
      case when l.share_level in ('country', 'city') then l.country end as country,
      case when l.share_level = 'city' then l.city end as city,
      exists (select 1 from public.businesses b where b.owner_id = p.id and b.status = 'approved' and b.community_id = any (pp.cids)) as is_owner,
      p.open_to_mentoring
    from people pp
    join public.profiles p on p.id = pp.uid and (p.directory_listed or p.id = v_uid)
    left join public.locations l on l.user_id = p.id
    cross join lateral (select private.is_connected(p.id) as conn) v
  )
  -- Filters apply to masked values only, so hidden fields cannot be inferred by filtering.
  select mk.uid, mk.full_name, mk.headline, mk.profession, mk.industry, mk.employer, mk.job_title, mk.country, mk.city,
         mk.is_owner, mk.open_to_mentoring, mk.cids, count(*) over ()
  from masked mk
  where (nullif(trim(p_search), '') is null or mk.full_name ilike private.like_pattern(trim(p_search))
         or mk.headline ilike private.like_pattern(trim(p_search)) or mk.employer ilike private.like_pattern(trim(p_search)))
    and (nullif(trim(p_profession), '') is null or mk.profession ilike private.like_pattern(trim(p_profession)))
    and (nullif(trim(p_industry), '') is null or mk.industry ilike private.like_pattern(trim(p_industry)))
    and (nullif(trim(p_country), '') is null or mk.country ilike private.like_pattern(trim(p_country)))
    and (nullif(trim(p_city), '') is null or mk.city ilike private.like_pattern(trim(p_city)))
    and (p_business_owner is null or mk.is_owner = p_business_owner)
  order by mk.full_name nulls last, mk.uid
  limit least(greatest(coalesce(p_limit, 48), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function public.get_member_profile(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); p public.profiles; l public.locations;
        v_self boolean; v_shares boolean; v_conn boolean; v_out jsonb := '{}'::jsonb; f text; v_conn_row public.connections;
begin
  v_self := p_user_id = v_uid;
  v_shares := private.shares_community(p_user_id);
  v_conn := private.is_connected(p_user_id);
  if not (v_self or v_shares or v_conn) then perform private.deny('profile not available'); end if;
  select * into p from public.profiles where id = p_user_id;
  if p.id is null then raise exception 'profile not found' using errcode = 'P0002'; end if;
  select * into l from public.locations where user_id = p_user_id;
  foreach f in array array['full_name','name_at_graduation','headline','about','profession','industry','employer',
                           'job_title','contact_email','phone','linkedin_url','website_url'] loop
    if private.visible(private.field_level(p.visibility, f), v_self, v_shares, v_conn) then
      v_out := v_out || jsonb_build_object(f, to_jsonb(p) -> f);
    end if;
  end loop;
  select * into v_conn_row from public.connections c
   where least(c.requester_id, c.addressee_id) = least(v_uid, p_user_id)
     and greatest(c.requester_id, c.addressee_id) = greatest(v_uid, p_user_id);
  return v_out || jsonb_build_object(
    'id', p.id, 'is_self', v_self, 'open_to_mentoring', p.open_to_mentoring,
    'country', case when l.share_level in ('country', 'city') then l.country end,
    'city', case when l.share_level = 'city' then l.city end,
    'connection', case when v_conn_row.id is null then null else jsonb_build_object(
      'id', v_conn_row.id, 'status', v_conn_row.status, 'outgoing', v_conn_row.requester_id = v_uid) end,
    'shared_communities', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug))
       from public.class_communities c
       where exists (select 1 from public.memberships a where a.community_id = c.id and a.user_id = v_uid and a.status = 'active')
         and exists (select 1 from public.memberships b where b.community_id = c.id and b.user_id = p_user_id and b.status = 'active')), '[]'::jsonb),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name))
       from public.businesses b where b.owner_id = p_user_id and b.status = 'approved' and private.is_member(b.community_id)), '[]'::jsonb));
end $$;

create function public.community_locations(p_community_id uuid)
returns table (user_id uuid, full_name text, country text, city text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := private.require_auth();
begin
  if not private.is_member(p_community_id) then perform private.deny(); end if;
  return query
  select p.id,
    case when private.visible(private.field_level(p.visibility, 'full_name'), p.id = v_uid, true, private.is_connected(p.id)) then p.full_name end,
    l.country, case when l.share_level = 'city' then l.city end
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  join public.locations l on l.user_id = m.user_id and l.share_level <> 'hidden'
  where m.community_id = p_community_id and m.status = 'active'
  order by l.country, l.city nulls last, p.full_name;
end $$;

---------------------------------------------------------------------------
-- Workflow C: Business
---------------------------------------------------------------------------
create function public.submit_business(p_business_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); b public.businesses;
begin
  select * into b from public.businesses where id = p_business_id for update;
  if b.id is null or b.owner_id <> v_uid then raise exception 'business not found' using errcode = 'P0002'; end if;
  if b.status not in ('draft', 'rejected') then raise exception 'business is already %', b.status using errcode = 'P0001'; end if;
  if not private.is_member(b.community_id) then perform private.deny(); end if;
  update public.businesses set status = 'submitted', submitted_at = now() where id = b.id;
  perform private.audit('business.submitted', 'community', b.community_id, 'business', b.id, '{}'::jsonb);
  perform private.notify_holders('business.review', 'community', b.community_id, 'business.submitted',
    'Business listing awaiting review', b.name, '/admin/approvals', array[v_uid]);
end $$;

create function public.review_business(p_business_id uuid, p_decision text, p_note text default null, p_owner_verified boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); b public.businesses; v_new public.business_status;
begin
  select * into b from public.businesses where id = p_business_id for update;
  if b.id is null then raise exception 'business not found' using errcode = 'P0002'; end if;
  if not private.can('business.review', b.community_id) then perform private.deny(); end if;
  if b.owner_id = v_uid then perform private.deny('you cannot review your own business'); end if;
  v_new := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' when 'suspend' then 'suspended' end;
  if v_new is null then raise exception 'decision must be approve, reject or suspend' using errcode = '22023'; end if;
  if v_new in ('approved', 'rejected') and b.status <> 'submitted' then
    raise exception 'only submitted listings can be approved or rejected' using errcode = 'P0001';
  end if;
  if v_new = 'suspended' and b.status <> 'approved' then raise exception 'only approved listings can be suspended' using errcode = 'P0001'; end if;
  update public.businesses set status = v_new, reviewed_by = v_uid, reviewed_at = now(),
         review_note = nullif(trim(p_note), ''), owner_verified = (v_new = 'approved' and coalesce(p_owner_verified, false))
   where id = b.id;
  perform private.audit('business.' || v_new::text, 'community', b.community_id, 'business', b.id,
    jsonb_build_object('owner_verified', p_owner_verified, 'note', p_note));
  perform private.notify(b.owner_id, b.community_id, 'business.' || v_new::text, 'Business listing ' || v_new::text,
    b.name || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/app/businesses');
end $$;

---------------------------------------------------------------------------
-- Workflow D: Events
---------------------------------------------------------------------------
create function public.event_rsvp_summary(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_cid uuid := private.event_community(p_event_id);
begin
  if v_cid is null or not (private.is_member(v_cid) or private.can('event.manage', v_cid)) then perform private.deny(); end if;
  return (select jsonb_build_object(
    'going', count(*) filter (where status = 'going'),
    'maybe', count(*) filter (where status = 'maybe'),
    'declined', count(*) filter (where status = 'declined'),
    'attended', count(*) filter (where attended))
    from public.event_rsvps where event_id = p_event_id);
end $$;

create function public.event_attendees(p_event_id uuid)
returns table (user_id uuid, full_name text, status public.rsvp_status, attended boolean, checked_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_cid uuid := private.event_community(p_event_id);
begin
  if v_cid is null or not private.can('event.manage', v_cid) then perform private.deny(); end if;
  return query select r.user_id, p.full_name, r.status, r.attended, r.checked_in_at
    from public.event_rsvps r join public.profiles p on p.id = r.user_id
    where r.event_id = p_event_id order by r.status, p.full_name;
end $$;

create function public.mark_attendance(p_event_id uuid, p_user_id uuid, p_attended boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_cid uuid := private.event_community(p_event_id);
begin
  if v_cid is null or not private.can('event.manage', v_cid) then perform private.deny(); end if;
  update public.event_rsvps set attended = p_attended,
         checked_in_by = case when p_attended then v_uid end, checked_in_at = case when p_attended then now() end
   where event_id = p_event_id and user_id = p_user_id;
  if not found then raise exception 'no RSVP for this member' using errcode = 'P0002'; end if;
  perform private.audit('event.attendance_marked', 'community', v_cid, 'event', p_event_id,
    jsonb_build_object('user_id', p_user_id, 'attended', p_attended));
end $$;

-- Reminder sweep for events starting within 24h; idempotent via reminded_at. Schedule with pg_cron (see supabase/ops).
create function private.enqueue_event_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  with due as (
    update public.event_rsvps r set reminded_at = now()
    from public.events e
    where e.id = r.event_id and e.status = 'published' and r.status in ('going', 'maybe') and r.reminded_at is null
      and e.starts_at between now() and now() + interval '24 hours'
    returning r.user_id, e.community_id, e.id, e.title, e.starts_at
  )
  insert into public.notifications (user_id, community_id, kind, title, body, link)
  select user_id, community_id, 'event.reminder', 'Reminder: ' || left(title, 180),
         'Starts ' || to_char(starts_at at time zone 'UTC', 'Dy DD Mon, HH24:MI "UTC"'), '/app/events/' || id
  from due;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Announcement fan-out to members.
create function private.announcement_fanout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, community_id, kind, title, body, link)
  select m.user_id, new.community_id, 'announcement.published', left(new.title, 200), left(new.body, 280), '/app/announcements'
  from public.memberships m where m.community_id = new.community_id and m.status = 'active' and m.user_id <> new.author_id;
  perform private.audit('announcement.published', 'community', new.community_id, 'announcement', new.id, '{}'::jsonb);
  return new;
end $$;
create trigger announcement_fanout after insert on public.announcements for each row execute function private.announcement_fanout();

-- Audit trail for directly-written privileged content.
create function private.audit_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  perform private.audit(tg_argv[0] || '.' || lower(tg_op), 'community', (v ->> 'community_id')::uuid, tg_argv[0], (v ->> 'id')::uuid,
    case when v ? 'status' then jsonb_build_object('status', v -> 'status') else '{}'::jsonb end);
  return null;
end $$;
create trigger events_audit after insert or update or delete on public.events for each row execute function private.audit_content('event');
create trigger announcements_audit after update or delete on public.announcements for each row execute function private.audit_content('announcement');
create trigger albums_audit after insert or delete on public.albums for each row execute function private.audit_content('album');

create function private.audit_media_moderation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.audit('media.' || new.status::text, 'community', new.community_id, 'media', new.id, '{}'::jsonb);
  end if;
  return null;
end $$;
create trigger media_moderation_audit after update on public.media_assets for each row execute function private.audit_media_moderation();

---------------------------------------------------------------------------
-- Workflow E: Administration
---------------------------------------------------------------------------
create function public.create_institution(p_name text, p_country text default null, p_city text default null,
                                          p_website_url text default null, p_verified boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid;
begin
  if not private.has_permission('institution.manage') then perform private.deny(); end if;
  perform private.require_mfa();
  insert into public.institutions (name, slug, country, city, website_url, status, verified_at, verified_by, created_by)
  values (trim(p_name), private.slugify(p_name), nullif(trim(p_country), ''), nullif(trim(p_city), ''), nullif(trim(p_website_url), ''),
          case when p_verified then 'verified'::public.institution_status else 'unverified'::public.institution_status end,
          case when p_verified then now() end, case when p_verified then v_uid end, v_uid)
  returning id into v_id;
  perform private.audit('institution.created', 'platform', null, 'institution', v_id, jsonb_build_object('name', p_name, 'verified', p_verified));
  return v_id;
end $$;

create function public.set_institution_status(p_institution_id uuid, p_status public.institution_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth();
begin
  if not private.has_permission('institution.manage') then perform private.deny(); end if;
  perform private.require_mfa();
  update public.institutions set status = p_status,
    verified_at = case when p_status = 'verified' then now() else verified_at end,
    verified_by = case when p_status = 'verified' then v_uid else verified_by end
  where id = p_institution_id;
  if not found then raise exception 'institution not found' using errcode = 'P0002'; end if;
  perform private.audit('institution.status_changed', 'platform', null, 'institution', p_institution_id, jsonb_build_object('status', p_status));
end $$;

create function public.create_community(
  p_department_name text, p_graduation_year int, p_institution_id uuid default null, p_name text default null,
  p_slug text default null, p_description text default null, p_activate boolean default false, p_request_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid; v_dept uuid; v_name text; v_slug text; v_inst_slug text;
begin
  if not (private.has_permission('community.create')
          or (p_institution_id is not null and private.has_permission('community.create', 'institution', p_institution_id))) then
    perform private.deny();
  end if;
  perform private.require_mfa();
  if p_institution_id is not null then
    select slug into v_inst_slug from public.institutions where id = p_institution_id;
    if v_inst_slug is null then raise exception 'institution not found' using errcode = 'P0002'; end if;
    insert into public.departments (institution_id, name) values (p_institution_id, trim(p_department_name))
    on conflict (institution_id, lower(name)) do nothing;
    select id into v_dept from public.departments where institution_id = p_institution_id and lower(name) = lower(trim(p_department_name));
  end if;
  v_name := coalesce(nullif(trim(p_name), ''), trim(p_department_name) || ' — Class of ' || p_graduation_year);
  v_slug := coalesce(nullif(private.slugify(p_slug), ''),
                     private.slugify(concat_ws('-', v_inst_slug, p_department_name, 'class-of', p_graduation_year::text)));
  insert into public.class_communities (slug, name, institution_id, department_id, department_name, graduation_year, description,
                                        status, verified_at, verified_by, created_by)
  values (v_slug, v_name, p_institution_id, v_dept, trim(p_department_name), p_graduation_year, nullif(trim(p_description), ''),
          case when p_activate then 'active'::public.community_status else 'pending_verification'::public.community_status end,
          case when p_activate then now() end, case when p_activate then v_uid end, v_uid)
  returning id into v_id;
  if p_request_id is not null then
    update public.community_requests set status = 'approved', resolved_community_id = v_id, reviewed_by = v_uid, reviewed_at = now()
    where id = p_request_id and status = 'pending';
    perform private.notify(requested_by, v_id, 'community.created', 'Your class community was created', v_name, '/community/' || v_slug)
      from public.community_requests where id = p_request_id;
  end if;
  perform private.audit('community.created', coalesce(case when p_institution_id is not null then 'institution' end, 'platform')::public.scope_type,
    p_institution_id, 'community', v_id, jsonb_build_object('name', v_name, 'slug', v_slug, 'active', p_activate));
  return v_id;
end $$;

create function public.update_community(p_community_id uuid, p_description text default null, p_status public.community_status default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); c public.class_communities;
begin
  select * into c from public.class_communities where id = p_community_id for update;
  if c.id is null then raise exception 'community not found' using errcode = 'P0002'; end if;
  if not private.can('community.manage', c.id) then perform private.deny(); end if;
  if p_status is not null and p_status <> c.status then
    -- verifying/archiving a community is a platform or institution decision
    if not (private.has_permission('community.create')
            or (c.institution_id is not null and private.has_permission('community.create', 'institution', c.institution_id))) then
      perform private.deny('only platform or institution admins can change community status');
    end if;
    perform private.require_mfa();
  end if;
  update public.class_communities set
    description = coalesce(nullif(trim(p_description), ''), description),
    status = coalesce(p_status, status),
    verified_at = case when p_status = 'active' and c.verified_at is null then now() else verified_at end,
    verified_by = case when p_status = 'active' and c.verified_at is null then v_uid else verified_by end
  where id = c.id;
  perform private.audit('community.updated', 'community', c.id, 'community', c.id,
    jsonb_build_object('status', p_status, 'description_changed', p_description is not null));
end $$;

create function public.resolve_community_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); r public.community_requests;
begin
  if not private.has_permission('community.create') then perform private.deny(); end if;
  update public.community_requests set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
    reviewed_by = v_uid, reviewed_at = now() where id = p_request_id and status = 'pending' returning * into r;
  if r.id is null then raise exception 'pending request not found' using errcode = 'P0002'; end if;
  perform private.audit('community_request.' || r.status::text, 'platform', null, 'community_request', r.id, '{}'::jsonb);
  perform private.notify(r.requested_by, null, 'community.request_' || r.status::text, 'Community request ' || r.status::text,
    r.department_name || ' — Class of ' || r.graduation_year, '/discover');
end $$;

-- Role assignment workflow (PRD §6): verified user → scope → role → preview → approval if required → confirm → audit → notify.
create function public.assign_role(p_user_id uuid, p_role_key text, p_scope_type public.scope_type, p_scope_id uuid default null,
                                   p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); r public.roles; v_assignment uuid; v_approval uuid; v_label text; v_cid uuid;
begin
  select * into r from public.roles where key = p_role_key;
  if r.key is null then raise exception 'unknown role' using errcode = 'P0002'; end if;
  if not r.assignable then perform private.deny('this role cannot be assigned'); end if;
  if r.scope_type <> p_scope_type then raise exception 'role % is %-scoped', r.key, r.scope_type using errcode = '22023'; end if;
  if (p_scope_type = 'platform') <> (p_scope_id is null) then raise exception 'invalid scope' using errcode = '22023'; end if;
  if p_user_id = v_uid then perform private.deny('you cannot assign roles to yourself'); end if;
  if not private.has_permission('role.assign', p_scope_type, p_scope_id) then perform private.deny(); end if;
  if private.actor_rank(v_uid, p_scope_type, p_scope_id) <= r.rank then
    perform private.deny('you can only assign roles ranked below your own');
  end if;
  perform private.require_mfa();

  if p_scope_type = 'institution' then
    select name into v_label from public.institutions where id = p_scope_id;
  elsif p_scope_type = 'community' then
    select name, id into v_label, v_cid from public.class_communities where id = p_scope_id;
  else v_label := 'ALUMS platform';
  end if;
  if v_label is null then raise exception 'scope not found' using errcode = 'P0002'; end if;

  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    raise exception 'user not found or email not verified' using errcode = 'P0002';
  end if;
  if p_scope_type = 'community' and not exists (
      select 1 from public.memberships where community_id = p_scope_id and user_id = p_user_id and status = 'active') then
    raise exception 'community roles can only be assigned to verified members' using errcode = 'P0001';
  end if;
  if exists (
      select 1 from public.role_assignments ra
      join public.role_conflicts rc on (rc.role_a = r.key and rc.role_b = ra.role_key) or (rc.role_b = r.key and rc.role_a = ra.role_key)
      where ra.user_id = p_user_id and ra.status in ('active', 'pending_approval')
        and ra.scope_type = p_scope_type and ra.scope_id is not distinct from p_scope_id) then
    perform private.deny('separation of duties: this role conflicts with one the member already holds');
  end if;
  if exists (select 1 from public.role_assignments where user_id = p_user_id and role_key = r.key
             and scope_id is not distinct from p_scope_id and status in ('active', 'pending_approval')) then
    raise exception 'member already holds or is pending this role' using errcode = 'P0001';
  end if;

  insert into public.role_assignments (user_id, role_key, scope_type, scope_id, status, reason, assigned_by, activated_at)
  values (p_user_id, r.key, p_scope_type, p_scope_id,
          case when r.requires_approval then 'pending_approval'::public.assignment_status else 'active'::public.assignment_status end,
          nullif(trim(p_reason), ''), v_uid, case when not r.requires_approval then now() end)
  returning id into v_assignment;

  if r.requires_approval then
    insert into public.approval_requests (kind, scope_type, scope_id, subject_id, target_user_id, payload, requested_by)
    values ('role_assignment', p_scope_type, p_scope_id, v_assignment, p_user_id,
            jsonb_build_object('role_key', r.key, 'role_name', r.name, 'scope_label', v_label, 'reason', p_reason), v_uid)
    returning id into v_approval;
    update public.role_assignments set approval_request_id = v_approval where id = v_assignment;
    perform private.audit('role.assignment_requested', p_scope_type, p_scope_id, 'user', p_user_id,
      jsonb_build_object('role', r.key, 'assignment_id', v_assignment, 'approval_id', v_approval));
    perform private.notify_holders('approval.decide', p_scope_type, p_scope_id, 'approval.requested',
      'Approval needed: ' || r.name, 'Role assignment in ' || v_label, '/admin/approvals', array[v_uid, p_user_id], true);
  else
    perform private.audit('role.assigned', p_scope_type, p_scope_id, 'user', p_user_id,
      jsonb_build_object('role', r.key, 'assignment_id', v_assignment));
    perform private.notify(p_user_id, v_cid, 'role.assigned', 'You are now ' || r.name, v_label, '/admin/dashboard');
  end if;

  return jsonb_build_object('assignment_id', v_assignment, 'approval_request_id', v_approval,
    'status', case when r.requires_approval then 'pending_approval' else 'active' end);
end $$;

create function public.decide_approval(p_request_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); a public.approval_requests; ra public.role_assignments; r public.roles; v_cid uuid;
begin
  select * into a from public.approval_requests where id = p_request_id for update;
  if a.id is null then raise exception 'approval request not found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'request already %', a.status using errcode = 'P0001'; end if;
  if v_uid = a.requested_by or v_uid = a.target_user_id then
    perform private.deny('approvals must be decided by an independent approver');
  end if;
  if not private.has_permission('approval.decide', a.scope_type, a.scope_id) then perform private.deny(); end if;
  perform private.require_mfa();

  select * into ra from public.role_assignments where id = a.subject_id for update;
  select * into r from public.roles where key = ra.role_key;
  if private.actor_rank(v_uid, a.scope_type, a.scope_id) <= r.rank then
    perform private.deny('approver must outrank the role being granted');
  end if;
  v_cid := case when a.scope_type = 'community' then a.scope_id end;

  if p_approve then
    if a.scope_type = 'community' and not exists (
        select 1 from public.memberships where community_id = a.scope_id and user_id = ra.user_id and status = 'active') then
      raise exception 'target is no longer a verified member' using errcode = 'P0001';
    end if;
    update public.role_assignments set status = 'active', activated_at = now() where id = ra.id and status = 'pending_approval';
  else
    update public.role_assignments set status = 'rejected' where id = ra.id and status = 'pending_approval';
  end if;
  update public.approval_requests set status = case when p_approve then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
    decided_by = v_uid, decided_at = now(), decision_note = nullif(trim(p_note), '') where id = a.id;

  perform private.audit(case when p_approve then 'approval.approved' else 'approval.rejected' end, a.scope_type, a.scope_id,
    'approval_request', a.id, jsonb_build_object('role', r.key, 'target', ra.user_id, 'note', p_note));
  if p_approve then
    perform private.audit('role.assigned', a.scope_type, a.scope_id, 'user', ra.user_id, jsonb_build_object('role', r.key, 'assignment_id', ra.id));
    perform private.notify(ra.user_id, v_cid, 'role.assigned', 'You are now ' || r.name, a.payload ->> 'scope_label', '/admin/dashboard');
  end if;
  perform private.notify(a.requested_by, v_cid, 'approval.decided', 'Approval ' || case when p_approve then 'granted' else 'declined' end,
    r.name || ' · ' || (a.payload ->> 'scope_label'), '/admin/roles');
end $$;

create function public.revoke_role(p_assignment_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); ra public.role_assignments; r public.roles;
begin
  select * into ra from public.role_assignments where id = p_assignment_id for update;
  if ra.id is null or ra.status not in ('active', 'pending_approval') then raise exception 'assignment not found' using errcode = 'P0002'; end if;
  select * into r from public.roles where key = ra.role_key;
  if ra.user_id <> v_uid then  -- anyone may step down from their own role
    if not private.has_permission('role.assign', ra.scope_type, ra.scope_id) then perform private.deny(); end if;
    if private.actor_rank(v_uid, ra.scope_type, ra.scope_id) <= r.rank then perform private.deny('you can only revoke roles ranked below your own'); end if;
    perform private.require_mfa();
  end if;
  update public.role_assignments set status = 'revoked', revoked_at = now(), revoked_by = v_uid,
    reason = coalesce(nullif(trim(p_reason), ''), reason) where id = ra.id;
  update public.approval_requests set status = 'cancelled' where id = ra.approval_request_id and status = 'pending';
  perform private.audit('role.revoked', ra.scope_type, ra.scope_id, 'user', ra.user_id, jsonb_build_object('role', ra.role_key, 'reason', p_reason));
  if ra.user_id <> v_uid then
    perform private.notify(ra.user_id, case when ra.scope_type = 'community' then ra.scope_id end, 'role.revoked',
      'Role removed: ' || r.name, p_reason, '/app/settings');
  end if;
end $$;

create function public.resolve_report(p_report_id uuid, p_status public.report_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); m public.moderation_reports;
begin
  select * into m from public.moderation_reports where id = p_report_id for update;
  if m.id is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  if not private.can('moderation.resolve', m.community_id) then perform private.deny(); end if;
  if p_status = 'open' then raise exception 'choose actioned or dismissed' using errcode = '22023'; end if;
  update public.moderation_reports set status = p_status, resolved_by = v_uid, resolved_at = now(), resolution_note = nullif(trim(p_note), '')
   where id = m.id;
  perform private.audit('moderation.' || p_status::text, 'community', m.community_id, m.target_type, m.target_id,
    jsonb_build_object('report_id', m.id, 'note', p_note));
end $$;

create function public.set_platform_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth();
begin
  if not private.has_permission('platform.settings') then perform private.deny(); end if;
  perform private.require_mfa();
  update public.platform_settings set value = p_value, updated_by = v_uid, updated_at = now() where key = p_key;
  if not found then raise exception 'unknown setting' using errcode = 'P0002'; end if;
  perform private.audit('platform.setting_changed', 'platform', null, 'setting', null, jsonb_build_object('key', p_key, 'value', p_value));
end $$;

---------------------------------------------------------------------------
-- Admin read models (real data only; BR-8)
---------------------------------------------------------------------------
create function public.my_permissions(p_scope_type public.scope_type default 'platform', p_scope_id uuid default null)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct rp.permission_key order by rp.permission_key), '{}')
  from private.applicable_assignments(auth.uid(), p_scope_type, p_scope_id) ra
  join public.role_permissions rp on rp.role_key = ra.role_key
$$;

create function public.my_admin_scopes()
returns table (scope_type public.scope_type, scope_id uuid, label text, roles text[], max_rank int)
language sql stable security definer set search_path = '' as $$
  select ra.scope_type, ra.scope_id,
    case ra.scope_type when 'platform' then 'ALUMS platform'
      when 'institution' then (select i.name from public.institutions i where i.id = ra.scope_id)
      else (select c.name from public.class_communities c where c.id = ra.scope_id) end,
    array_agg(ra.role_key order by r.rank desc), max(r.rank)
  from public.role_assignments ra
  join public.roles r on r.key = ra.role_key
  where ra.user_id = auth.uid() and ra.status = 'active' and (ra.expires_at is null or ra.expires_at > now())
    and exists (select 1 from public.role_permissions rp where rp.role_key = ra.role_key and rp.permission_key = 'community.view_admin')
    and (ra.scope_type <> 'community' or exists (select 1 from public.memberships m
         where m.community_id = ra.scope_id and m.user_id = ra.user_id and m.status = 'active'))
  group by 1, 2, 3
  order by 5 desc
$$;

create function public.admin_communities()
returns table (id uuid, slug text, name text, department_name text, graduation_year int, institution_id uuid,
               institution_name text, status public.community_status, is_founding boolean, active_members bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.department_name, c.graduation_year, c.institution_id, i.name, c.status, c.is_founding,
         (select count(*) from public.memberships m where m.community_id = c.id and m.status = 'active')
  from public.class_communities c left join public.institutions i on i.id = c.institution_id
  where private.can('community.view_admin', c.id)
  order by c.is_founding desc, c.graduation_year desc, c.name
$$;

create function public.admin_overview(p_scope_type public.scope_type, p_scope_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_auth();
  if not private.has_permission('community.view_admin', p_scope_type, p_scope_id) then perform private.deny(); end if;
  with sc as (
    select c.id from public.class_communities c
    where p_scope_type = 'platform' or (p_scope_type = 'institution' and c.institution_id = p_scope_id)
       or (p_scope_type = 'community' and c.id = p_scope_id)
  )
  select jsonb_build_object(
    'communities',         (select count(*) from sc),
    'active_members',      (select count(*) from public.memberships m join sc on sc.id = m.community_id where m.status = 'active'),
    'suspended_members',   (select count(*) from public.memberships m join sc on sc.id = m.community_id where m.status = 'suspended'),
    'pending_requests',    (select count(*) from public.membership_requests r join sc on sc.id = r.community_id where r.status = 'pending'),
    'businesses_pending',  (select count(*) from public.businesses b join sc on sc.id = b.community_id where b.status = 'submitted'),
    'businesses_approved', (select count(*) from public.businesses b join sc on sc.id = b.community_id where b.status = 'approved'),
    'upcoming_events',     (select count(*) from public.events e join sc on sc.id = e.community_id where e.status = 'published' and e.starts_at > now()),
    'rsvps_going',         (select count(*) from public.event_rsvps r join public.events e on e.id = r.event_id join sc on sc.id = e.community_id where r.status = 'going'),
    'open_reports',        (select count(*) from public.moderation_reports x join sc on sc.id = x.community_id where x.status = 'open'),
    'profiles_completed',  (select count(*) from public.memberships m join sc on sc.id = m.community_id join public.profiles p on p.id = m.user_id
                             where m.status = 'active' and p.full_name <> '' and p.headline is not null and p.profession is not null),
    'pending_approvals',   (select count(*) from public.approval_requests a where a.status = 'pending'
                             and (p_scope_type = 'platform' or (a.scope_type = p_scope_type and a.scope_id = p_scope_id)
                                  or (a.scope_type = 'community' and a.scope_id in (select id from sc)))),
    'community_requests',  case when p_scope_type = 'platform' then (select count(*) from public.community_requests where status = 'pending') end
  ) into v;
  return v;
end $$;

create function public.admin_members(p_community_id uuid, p_status public.membership_status default null)
returns table (membership_id uuid, user_id uuid, full_name text, status public.membership_status, verification_method text,
               verified_at timestamptz, roles text[])
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_auth();
  if not private.can('member.view', p_community_id) then perform private.deny(); end if;
  -- Governance view: name only. Other profile fields stay subject to the member's own visibility settings.
  return query
  select m.id, m.user_id, p.full_name, m.status, m.verification_method, m.verified_at,
    coalesce((select array_agg(ra.role_key) from public.role_assignments ra
              where ra.user_id = m.user_id and ra.scope_type = 'community' and ra.scope_id = m.community_id and ra.status = 'active'), '{}')
  from public.memberships m join public.profiles p on p.id = m.user_id
  where m.community_id = p_community_id and (p_status is null or m.status = p_status)
  order by p.full_name;
end $$;

create function public.admin_membership_requests(p_community_id uuid, p_status public.request_status default 'pending')
returns table (id uuid, user_id uuid, account_name text, name_at_graduation text, student_identifier text, note text,
               status public.request_status, created_at timestamptz, reviewed_at timestamptz, decision_note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_auth();
  if not private.can('membership.review', p_community_id) then perform private.deny(); end if;
  return query
  select r.id, r.user_id, p.full_name, r.name_at_graduation, r.student_identifier, r.note, r.status, r.created_at, r.reviewed_at, r.decision_note
  from public.membership_requests r join public.profiles p on p.id = r.user_id
  where r.community_id = p_community_id and (p_status is null or r.status = p_status)
  order by r.created_at;
end $$;

create function public.admin_role_assignments(p_scope_type public.scope_type, p_scope_id uuid default null)
returns table (id uuid, user_id uuid, full_name text, role_key text, status public.assignment_status, assigned_by_name text,
               created_at timestamptz, activated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_auth();
  if not (private.has_permission('role.assign', p_scope_type, p_scope_id) or private.has_permission('member.view', p_scope_type, p_scope_id)) then
    perform private.deny();
  end if;
  return query
  select ra.id, ra.user_id, p.full_name, ra.role_key, ra.status, ap.full_name, ra.created_at, ra.activated_at
  from public.role_assignments ra
  join public.profiles p on p.id = ra.user_id
  left join public.profiles ap on ap.id = ra.assigned_by
  where ra.scope_type = p_scope_type and ra.scope_id is not distinct from p_scope_id and ra.status in ('active', 'pending_approval')
  order by ra.created_at desc;
end $$;

create function public.admin_pending_approvals()
returns table (id uuid, kind text, scope_type public.scope_type, scope_id uuid, payload jsonb, target_name text,
               requested_by_name text, requested_by uuid, target_user_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kind, a.scope_type, a.scope_id, a.payload, t.full_name, q.full_name, a.requested_by, a.target_user_id, a.created_at
  from public.approval_requests a
  left join public.profiles t on t.id = a.target_user_id
  left join public.profiles q on q.id = a.requested_by
  where a.status = 'pending' and private.has_permission('approval.decide', a.scope_type, a.scope_id)
  order by a.created_at
$$;

create function public.admin_find_user(p_email text)
returns table (user_id uuid, full_name text, email_verified boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_auth();
  -- platform or institution role-assigners only (community leaders pick from their verified roster instead)
  if not (private.has_permission('role.assign')
          or exists (select 1 from public.role_assignments ra join public.role_permissions rp on rp.role_key = ra.role_key
                     where ra.user_id = auth.uid() and ra.status = 'active' and ra.scope_type = 'institution' and rp.permission_key = 'role.assign')) then
    perform private.deny();
  end if;
  return query select u.id, p.full_name, u.email_confirmed_at is not null
    from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = lower(trim(p_email));
end $$;

create function public.admin_audit_logs(p_scope_type public.scope_type, p_scope_id uuid default null, p_limit int default 100, p_before bigint default null)
returns table (id bigint, occurred_at timestamptz, actor_id uuid, actor_name text, action text, scope_type public.scope_type,
               scope_id uuid, target_type text, target_id uuid, metadata jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_auth();
  if not private.has_permission('audit.view', p_scope_type, p_scope_id) then perform private.deny(); end if;
  return query
  select l.id, l.occurred_at, l.actor_id, p.full_name, l.action, l.scope_type, l.scope_id, l.target_type, l.target_id, l.metadata
  from public.audit_logs l left join public.profiles p on p.id = l.actor_id
  where (p_before is null or l.id < p_before)
    and (p_scope_type = 'platform'
         or (l.scope_type = p_scope_type and l.scope_id = p_scope_id)
         or (p_scope_type = 'institution' and l.scope_type = 'community'
             and l.scope_id in (select c.id from public.class_communities c where c.institution_id = p_scope_id)))
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

---------------------------------------------------------------------------
-- Function privileges
---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
grant execute on function
  private.is_member(uuid), private.shares_community(uuid), private.is_connected(uuid),
  private.has_permission(text, public.scope_type, uuid), private.can(text, uuid),
  private.event_community(uuid), private.event_open_for_rsvp(uuid), private.try_uuid(text),
  private.field_level(jsonb, text), private.visible(public.visibility_level, boolean, boolean, boolean),
  private.valid_visibility(jsonb), private.like_pattern(text), private.slugify(text)
  to anon, authenticated, service_role;

grant execute on function public.search_communities(text, text, int, int) to anon, authenticated;
grant execute on function
  public.request_community(text, text, int, text),
  public.apply_for_membership(uuid, text, text, text),
  public.withdraw_membership_request(uuid),
  public.review_membership_request(uuid, boolean, text),
  public.set_membership_status(uuid, public.membership_status, text),
  public.leave_community(uuid),
  public.create_invitation(uuid, text),
  public.accept_invitation(text),
  public.community_directory(uuid, text, uuid, int, text, text, text, text, text, boolean, int, int),
  public.get_member_profile(uuid),
  public.community_locations(uuid),
  public.submit_business(uuid),
  public.review_business(uuid, text, text, boolean),
  public.event_rsvp_summary(uuid),
  public.event_attendees(uuid),
  public.mark_attendance(uuid, uuid, boolean),
  public.create_institution(text, text, text, text, boolean),
  public.set_institution_status(uuid, public.institution_status),
  public.create_community(text, int, uuid, text, text, text, boolean, uuid),
  public.update_community(uuid, text, public.community_status),
  public.resolve_community_request(uuid, boolean),
  public.assign_role(uuid, text, public.scope_type, uuid, text),
  public.decide_approval(uuid, boolean, text),
  public.revoke_role(uuid, text),
  public.resolve_report(uuid, public.report_status, text),
  public.set_platform_setting(text, jsonb),
  public.my_permissions(public.scope_type, uuid),
  public.my_admin_scopes(),
  public.admin_communities(),
  public.admin_overview(public.scope_type, uuid),
  public.admin_members(uuid, public.membership_status),
  public.admin_membership_requests(uuid, public.request_status),
  public.admin_role_assignments(public.scope_type, uuid),
  public.admin_pending_approvals(),
  public.admin_find_user(text),
  public.admin_audit_logs(public.scope_type, uuid, int, bigint)
  to authenticated;
