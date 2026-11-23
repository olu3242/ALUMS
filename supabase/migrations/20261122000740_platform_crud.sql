-- Platform CRED (create/read/edit/delete) for admins. "Safe delete": a record is hard-deleted only when nothing
-- depends on it; otherwise the RPC refuses and the admin archives/suspends instead (reversible). All writes: MFA + audit.

-- Institutions ----------------------------------------------------------------
create function public.update_institution(p_institution_id uuid, p_name text, p_country text default null,
                                          p_city text default null, p_website_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); i public.institutions; v_name text := trim(p_name);
begin
  if not private.has_permission('institution.manage') then perform private.deny(); end if;
  perform private.require_mfa();
  select * into i from public.institutions where id = p_institution_id for update;
  if i.id is null then raise exception 'institution not found' using errcode = 'P0002'; end if;
  if char_length(coalesce(v_name, '')) < 2 then raise exception 'institution name is required' using errcode = '22023'; end if;
  update public.institutions set name = v_name, country = nullif(trim(p_country), ''), city = nullif(trim(p_city), ''),
    website_url = nullif(trim(p_website_url), ''),
    -- a renamed entry no longer matches its directory record's official name
    directory_id = case when v_name is distinct from i.name then null else directory_id end,
    updated_at = now()
  where id = i.id;
  perform private.audit('institution.updated', 'platform', null, 'institution', i.id, jsonb_build_object(
    'renamed', v_name is distinct from i.name, 'old_name', i.name, 'new_name', v_name,
    'directory_unlinked', i.directory_id is not null and v_name is distinct from i.name));
end $$;

create function public.delete_institution(p_institution_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); i public.institutions;
begin
  if not private.has_permission('institution.manage') then perform private.deny(); end if;
  perform private.require_mfa();
  select * into i from public.institutions where id = p_institution_id for update;
  if i.id is null then raise exception 'institution not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.class_communities where institution_id = i.id)
     or exists (select 1 from public.community_affiliations where institution_id = i.id and status in ('pending', 'approved'))
     or exists (select 1 from public.institution_posts where institution_id = i.id)
     or exists (select 1 from public.role_assignments where scope_type = 'institution' and scope_id = i.id and status in ('active', 'pending_approval')) then
    raise exception 'this institution has classes, affiliations, posts or admins; archive it instead' using errcode = 'P0001';
  end if;
  perform private.audit('institution.deleted', 'platform', null, 'institution', i.id, jsonb_build_object('name', i.name, 'slug', i.slug));
  delete from public.institutions where id = i.id;  -- departments, links and closed affiliations cascade
end $$;

-- Communities -----------------------------------------------------------------
create function public.edit_community(p_community_id uuid, p_name text, p_department_name text, p_graduation_year int,
                                      p_institution_id uuid default null, p_change_institution boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); c public.class_communities; v_inst uuid; v_dept uuid;
begin
  select * into c from public.class_communities where id = p_community_id for update;
  if c.id is null then raise exception 'community not found' using errcode = 'P0002'; end if;
  if not (private.has_permission('community.create')
          or (c.institution_id is not null and private.has_permission('community.create', 'institution', c.institution_id))) then
    perform private.deny();
  end if;
  perform private.require_mfa();
  v_inst := case when p_change_institution then p_institution_id else c.institution_id end;
  if v_inst is distinct from c.institution_id then
    if not private.has_permission('community.create') then perform private.deny('only platform admins can change a class''s institution'); end if;
    if exists (select 1 from public.community_affiliations where community_id = c.id and status in ('pending', 'approved')) then
      raise exception 'end the current institution affiliation first' using errcode = 'P0001';
    end if;
    if v_inst is not null and not exists (select 1 from public.institutions where id = v_inst) then
      raise exception 'institution not found' using errcode = 'P0002';
    end if;
  end if;
  if char_length(coalesce(trim(p_name), '')) < 2 or char_length(coalesce(trim(p_department_name), '')) < 2 then
    raise exception 'name and department are required' using errcode = '22023';
  end if;
  if v_inst is not null and exists (select 1 from public.class_communities where id <> c.id and institution_id = v_inst
       and lower(department_name) = lower(trim(p_department_name)) and graduation_year = p_graduation_year) then
    raise exception 'another community already exists for this department and year' using errcode = 'P0001';
  end if;
  if v_inst is not null then
    insert into public.departments (institution_id, name) values (v_inst, trim(p_department_name)) on conflict (institution_id, lower(name)) do nothing;
    select id into v_dept from public.departments where institution_id = v_inst and lower(name) = lower(trim(p_department_name));
  end if;
  update public.class_communities set name = trim(p_name), department_name = trim(p_department_name),
    graduation_year = p_graduation_year, institution_id = v_inst, department_id = v_dept, updated_at = now()
  where id = c.id;  -- slug stays stable so links and invitations keep working
  perform private.audit('community.edited', 'community', c.id, 'community', c.id, jsonb_build_object(
    'old', jsonb_build_object('name', c.name, 'department', c.department_name, 'year', c.graduation_year, 'institution_id', c.institution_id),
    'new', jsonb_build_object('name', trim(p_name), 'department', trim(p_department_name), 'year', p_graduation_year, 'institution_id', v_inst)));
end $$;

create function public.delete_community(p_community_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); c public.class_communities;
begin
  if not private.has_permission('community.create') then perform private.deny(); end if;
  perform private.require_mfa();
  select * into c from public.class_communities where id = p_community_id for update;
  if c.id is null then raise exception 'community not found' using errcode = 'P0002'; end if;
  if c.is_founding then raise exception 'the founding community cannot be deleted; archive it instead' using errcode = 'P0001'; end if;
  if exists (select 1 from public.memberships where community_id = c.id)
     or exists (select 1 from public.membership_requests where community_id = c.id and status = 'pending')
     or exists (select 1 from public.dues_payments where community_id = c.id)
     or exists (select 1 from public.events where community_id = c.id)
     or exists (select 1 from public.announcements where community_id = c.id)
     or exists (select 1 from public.businesses where community_id = c.id)
     or exists (select 1 from public.albums where community_id = c.id) then
    raise exception 'this community has members, requests, payments or content; archive it instead' using errcode = 'P0001';
  end if;
  update public.role_assignments set status = 'revoked', revoked_at = now(), revoked_by = v_uid, reason = 'community deleted'
  where scope_type = 'community' and scope_id = c.id and status in ('active', 'pending_approval');
  perform private.audit('community.deleted', 'platform', null, 'community', c.id, jsonb_build_object('name', c.name, 'slug', c.slug));
  delete from public.class_communities where id = c.id;
end $$;

-- Members ---------------------------------------------------------------------
-- Removal = status 'left' + roles revoked. Reversible with set_membership_status(..., 'active').
create function public.remove_member(p_membership_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); m public.memberships;
begin
  select * into m from public.memberships where id = p_membership_id for update;
  if m.id is null then raise exception 'membership not found' using errcode = 'P0002'; end if;
  if not private.can('member.suspend', m.community_id) then perform private.deny(); end if;
  if m.user_id = v_uid then perform private.deny('use Leave class to remove yourself'); end if;
  if private.actor_rank(m.user_id, 'community', m.community_id) >= private.actor_rank(v_uid, 'community', m.community_id) then
    perform private.deny('you cannot remove an equal or higher-ranked leader');
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  perform private.require_mfa();
  update public.memberships set status = 'left' where id = m.id;
  perform private.revoke_community_roles(m.user_id, m.community_id, 'removed from community');
  perform private.audit('membership.removed', 'community', m.community_id, 'user', m.user_id, jsonb_build_object('reason', trim(p_reason)));
  perform private.notify(m.user_id, m.community_id, 'membership.status', 'Removed from class', trim(p_reason), '/app/my-classes');
end $$;

-- Accounts (platform scope only) ------------------------------------------------
create function public.admin_list_users(p_query text default null, p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, full_name text, email text, email_confirmed boolean, created_at timestamptz,
               last_sign_in_at timestamptz, suspended boolean, platform_roles text[], communities jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_q text := nullif(trim(p_query), '');
begin
  perform private.require_auth();
  if not private.has_permission('member.view') then perform private.deny(); end if;
  return query
  select u.id, p.full_name, u.email::text, u.email_confirmed_at is not null, u.created_at, u.last_sign_in_at,
    coalesce(u.banned_until > now(), false),
    coalesce((select array_agg(ra.role_key order by ra.role_key) from public.role_assignments ra
              where ra.user_id = u.id and ra.scope_type in ('platform', 'institution') and ra.status = 'active'), '{}'),
    coalesce((select jsonb_agg(jsonb_build_object('membership_id', m.id, 'name', c.name, 'status', m.status) order by c.name)
              from public.memberships m join public.class_communities c on c.id = m.community_id where m.user_id = u.id), '[]'::jsonb)
  from auth.users u left join public.profiles p on p.id = u.id
  where v_q is null or u.email ilike private.like_pattern(v_q) or p.full_name ilike private.like_pattern(v_q)
  order by u.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

create function public.set_account_status(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth();
begin
  if not private.has_permission('member.suspend') then perform private.deny(); end if;
  if p_user_id = v_uid then perform private.deny('you cannot suspend your own account'); end if;
  if private.actor_rank(p_user_id, 'platform', null) >= private.actor_rank(v_uid, 'platform', null) then
    perform private.deny('you cannot change an equal or higher-ranked admin''s account');
  end if;
  if p_suspended and char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  perform private.require_mfa();
  update auth.users set banned_until = case when p_suspended then now() + interval '100 years' else null end where id = p_user_id;
  if not found then raise exception 'account not found' using errcode = 'P0002'; end if;
  if p_suspended then delete from auth.sessions where user_id = p_user_id; end if;  -- sign out everywhere
  perform private.audit(case when p_suspended then 'account.suspended' else 'account.reinstated' end,
    'platform', null, 'user', p_user_id, jsonb_build_object('reason', nullif(trim(p_reason), '')));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.update_institution(uuid, text, text, text, text)', 'public.delete_institution(uuid)',
    'public.edit_community(uuid, text, text, int, uuid, boolean)', 'public.delete_community(uuid)',
    'public.remove_member(uuid, text)', 'public.admin_list_users(text, int, int)', 'public.set_account_status(uuid, boolean, text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
