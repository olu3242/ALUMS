-- edit_community: pick the institution the same way members search (worldwide directory or typed name),
-- then department, then year. Name is optional (defaults to "<Department> — Class of <Year>").
-- An institution picked from the directory that ALUMS doesn't have yet is created UNVERIFIED (hidden publicly,
-- shown as "pending confirmation"); verification stays a separate, explicit step.
drop function public.edit_community(uuid, text, text, int, uuid, boolean);

create function public.edit_community(p_community_id uuid, p_name text, p_department_name text, p_graduation_year int,
                                      p_institution_id uuid default null, p_change_institution boolean default false,
                                      p_institution_name text default null, p_directory_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); c public.class_communities; v_inst uuid; v_dept uuid; v_name text;
        v_iname text := nullif(trim(p_institution_name), ''); v_country text; v_slug text;
begin
  select * into c from public.class_communities where id = p_community_id for update;
  if c.id is null then raise exception 'community not found' using errcode = 'P0002'; end if;
  if not (private.has_permission('community.create')
          or (c.institution_id is not null and private.has_permission('community.create', 'institution', c.institution_id))) then
    perform private.deny();
  end if;
  perform private.require_mfa();

  v_inst := c.institution_id;
  if p_change_institution then
    if p_directory_id is not null then
      select name, country into v_iname, v_country from public.institution_directory where id = p_directory_id;  -- official name wins
      if v_iname is null then raise exception 'institution not found in the directory' using errcode = 'P0002'; end if;
      select id into v_inst from public.institutions where directory_id = p_directory_id order by (status = 'verified') desc limit 1;
    elsif v_iname is not null then
      v_inst := null;
    else
      v_inst := coalesce(p_institution_id, null);
    end if;
    if v_inst is null and v_iname is not null then  -- unchanged name keeps the current institution, whatever its status
      select id into v_inst from public.institutions where id = c.institution_id and lower(name) = lower(v_iname);
    end if;
    if v_inst is null and v_iname is not null then
      select id into v_inst from public.institutions where lower(name) = lower(v_iname) and status <> 'archived'
      order by (status = 'verified') desc limit 1;
    end if;
    if v_inst is null and v_iname is not null then
      if not private.has_permission('institution.manage') then perform private.deny('only platform admins can add an institution'); end if;
      v_slug := private.slugify(v_iname);
      if exists (select 1 from public.institutions where slug = v_slug) then v_slug := left(v_slug, 73) || '-' || substr(md5(random()::text), 1, 6); end if;
      insert into public.institutions (name, slug, country, status, created_by, directory_id)
      values (v_iname, v_slug, v_country, 'unverified', v_uid, p_directory_id) returning id into v_inst;
      perform private.audit('institution.created', 'platform', null, 'institution', v_inst,
        jsonb_build_object('name', v_iname, 'verified', false, 'directory_id', p_directory_id, 'source', 'community_edit'));
    end if;
  end if;

  if v_inst is distinct from c.institution_id then
    if not private.has_permission('community.create') then perform private.deny('only platform admins can change a class''s institution'); end if;
    if exists (select 1 from public.community_affiliations where community_id = c.id and status in ('pending', 'approved')) then
      raise exception 'end the current institution affiliation first' using errcode = 'P0001';
    end if;
    if v_inst is not null and not exists (select 1 from public.institutions where id = v_inst) then
      raise exception 'institution not found' using errcode = 'P0002';
    end if;
  end if;
  if char_length(coalesce(trim(p_department_name), '')) < 2 then raise exception 'department is required' using errcode = '22023'; end if;
  v_name := coalesce(nullif(trim(p_name), ''), trim(p_department_name) || ' — Class of ' || p_graduation_year);
  if v_inst is not null and exists (select 1 from public.class_communities where id <> c.id and institution_id = v_inst
       and lower(department_name) = lower(trim(p_department_name)) and graduation_year = p_graduation_year) then
    raise exception 'another community already exists for this institution, department and year' using errcode = 'P0001';
  end if;
  if v_inst is not null then
    insert into public.departments (institution_id, name) values (v_inst, trim(p_department_name)) on conflict (institution_id, lower(name)) do nothing;
    select id into v_dept from public.departments where institution_id = v_inst and lower(name) = lower(trim(p_department_name));
  end if;
  update public.class_communities set name = v_name, department_name = trim(p_department_name),
    graduation_year = p_graduation_year, institution_id = v_inst, department_id = v_dept, updated_at = now()
  where id = c.id;  -- slug stays stable so links and invitations keep working
  perform private.audit('community.edited', 'community', c.id, 'community', c.id, jsonb_build_object(
    'old', jsonb_build_object('name', c.name, 'department', c.department_name, 'year', c.graduation_year, 'institution_id', c.institution_id),
    'new', jsonb_build_object('name', v_name, 'department', trim(p_department_name), 'year', p_graduation_year, 'institution_id', v_inst)));
end $$;
revoke all on function public.edit_community(uuid, text, text, int, uuid, boolean, text, bigint) from public;
grant execute on function public.edit_community(uuid, text, text, int, uuid, boolean, text, bigint) to authenticated;
