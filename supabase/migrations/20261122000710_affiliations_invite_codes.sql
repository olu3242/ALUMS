-- Institution ↔ alumni-group affiliations, and shareable invitation codes.

---------------------------------------------------------------------------
-- Affiliations: a class community links to a verified institution via a request the institution approves.
---------------------------------------------------------------------------
create table public.community_affiliations (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid not null references public.class_communities (id) on delete cascade,
  institution_id uuid not null references public.institutions (id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  message        text check (char_length(message) <= 1000),
  requested_by   uuid references auth.users (id) on delete set null,   -- null for links created by platform admins at setup
  decided_by     uuid references auth.users (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text check (char_length(decision_note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (decided_by is null or decided_by is distinct from requested_by)
);
create unique index community_affiliations_live on public.community_affiliations (community_id) where status in ('pending', 'approved');
create index community_affiliations_inst_idx on public.community_affiliations (institution_id, status);
create trigger community_affiliations_touch before update on public.community_affiliations for each row execute function private.touch_updated_at();

-- Existing institution links become approved affiliations; communities created with an institution get one automatically.
insert into public.community_affiliations (community_id, institution_id, status, requested_by, decided_at, decision_note)
select id, institution_id, 'approved', created_by, now(), 'Linked when the community was created'
from public.class_communities where institution_id is not null
on conflict do nothing;

create function private.affiliate_on_create() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.institution_id is not null then
    insert into public.community_affiliations (community_id, institution_id, status, requested_by, decided_at, decision_note)
    values (new.id, new.institution_id, 'approved', new.created_by, now(), 'Linked when the community was created');
  end if;
  return new;
end $$;
create trigger class_communities_affiliate after insert on public.class_communities for each row execute function private.affiliate_on_create();

alter table public.community_affiliations enable row level security;
revoke all on public.community_affiliations from anon, authenticated;
grant select on public.community_affiliations to authenticated;
create policy affiliations_read on public.community_affiliations for select to authenticated
  using (private.can('community.view_admin', community_id)
         or private.has_permission('community.view_admin', 'institution', institution_id));

create function private.can_decide_affiliation(p_institution_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_permission('community.create', 'institution', p_institution_id)
$$;

create function public.request_affiliation(p_community_id uuid, p_institution_id uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid; v_comm text; v_inst text;
begin
  if not private.can('community.manage', p_community_id) then perform private.deny(); end if;
  select name into v_inst from public.institutions where id = p_institution_id and status = 'verified';
  if v_inst is null then raise exception 'institution not found or not verified yet' using errcode = 'P0002'; end if;
  select name into v_comm from public.class_communities where id = p_community_id;
  if exists (select 1 from public.community_affiliations where community_id = p_community_id and status in ('pending', 'approved')) then
    raise exception 'this community already has a pending or approved affiliation' using errcode = 'P0001';
  end if;
  insert into public.community_affiliations (community_id, institution_id, message, requested_by)
  values (p_community_id, p_institution_id, nullif(trim(p_message), ''), v_uid) returning id into v_id;
  perform private.audit('affiliation.requested', 'community', p_community_id, 'institution', p_institution_id, jsonb_build_object('affiliation_id', v_id));
  perform private.notify_holders('community.create', 'institution', p_institution_id, 'affiliation.requested',
    'Affiliation request: ' || v_comm, v_comm || ' asks to join the ' || v_inst || ' alumni network.', '/admin/institution', array[v_uid], true);
  return v_id;
end $$;

create function public.decide_affiliation(p_affiliation_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); a public.community_affiliations; c public.class_communities; v_dept uuid; v_inst text;
begin
  select * into a from public.community_affiliations where id = p_affiliation_id for update;
  if a.id is null then raise exception 'request not found' using errcode = 'P0002'; end if;
  if not private.can_decide_affiliation(a.institution_id) then perform private.deny(); end if;
  if a.status <> 'pending' then raise exception 'request already %', a.status using errcode = 'P0001'; end if;
  if a.requested_by = v_uid then perform private.deny('affiliations must be approved by someone other than the requester'); end if;
  perform private.require_mfa();
  select * into c from public.class_communities where id = a.community_id for update;
  select name into v_inst from public.institutions where id = a.institution_id;
  if p_approve then
    if c.institution_id is not null and c.institution_id <> a.institution_id then
      raise exception 'this community is already linked to another institution' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.class_communities x where x.institution_id = a.institution_id and x.id <> c.id
               and lower(x.department_name) = lower(c.department_name) and x.graduation_year = c.graduation_year) then
      raise exception 'this institution already has a community for % — class of %', c.department_name, c.graduation_year using errcode = 'P0001';
    end if;
    insert into public.departments (institution_id, name) values (a.institution_id, c.department_name)
    on conflict (institution_id, lower(name)) do nothing;
    select id into v_dept from public.departments where institution_id = a.institution_id and lower(name) = lower(c.department_name);
    update public.class_communities set institution_id = a.institution_id, department_id = v_dept where id = c.id;
  end if;
  update public.community_affiliations set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = v_uid, decided_at = now(), decision_note = nullif(trim(p_note), '') where id = a.id;
  perform private.audit(case when p_approve then 'affiliation.approved' else 'affiliation.rejected' end, 'institution', a.institution_id,
    'community', a.community_id, jsonb_build_object('affiliation_id', a.id, 'note', p_note));
  perform private.notify_holders('community.manage', 'community', a.community_id, 'affiliation.decided',
    case when p_approve then 'Affiliation approved' else 'Affiliation declined' end,
    c.name || ' · ' || v_inst || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/admin/settings', array[v_uid]);
end $$;

-- Either side may end an approved affiliation (community leaves, or institution removes it).
create function public.revoke_affiliation(p_affiliation_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); a public.community_affiliations;
begin
  select * into a from public.community_affiliations where id = p_affiliation_id for update;
  if a.id is null then raise exception 'affiliation not found' using errcode = 'P0002'; end if;
  if not (private.can('community.manage', a.community_id) or private.can_decide_affiliation(a.institution_id)) then perform private.deny(); end if;
  if a.status not in ('approved', 'pending') then raise exception 'affiliation already %', a.status using errcode = 'P0001'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  perform private.require_mfa();
  update public.community_affiliations set status = 'revoked', decided_by = case when v_uid is distinct from requested_by then v_uid end,
    decided_at = now(), decision_note = trim(p_reason) where id = a.id;
  if a.status = 'approved' then
    update public.class_communities set institution_id = null, department_id = null where id = a.community_id and institution_id = a.institution_id;
  end if;
  perform private.audit('affiliation.revoked', 'institution', a.institution_id, 'community', a.community_id,
    jsonb_build_object('affiliation_id', a.id, 'reason', p_reason));
end $$;

-- Real growth figures for an institution's network (BR-8).
create function public.institution_network_stats(p_institution_id uuid)
returns table (community_id uuid, name text, slug text, graduation_year int, active_members bigint, members_30d bigint, events_upcoming bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.has_permission('community.view_admin', 'institution', p_institution_id) then perform private.deny(); end if;
  return query
  select c.id, c.name, c.slug, c.graduation_year,
    (select count(*) from public.memberships m where m.community_id = c.id and m.status = 'active'),
    (select count(*) from public.memberships m where m.community_id = c.id and m.status = 'active' and m.verified_at > now() - interval '30 days'),
    (select count(*) from public.events e where e.community_id = c.id and e.status = 'published' and e.starts_at > now())
  from public.class_communities c where c.institution_id = p_institution_id
  order by c.graduation_year desc, c.name;
end $$;

---------------------------------------------------------------------------
-- Invitation codes
---------------------------------------------------------------------------
alter table public.memberships drop constraint memberships_verification_method_check;
alter table public.memberships add constraint memberships_verification_method_check
  check (verification_method in ('request_review', 'invitation', 'invitation_code', 'bootstrap'));

create table public.invite_codes (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.class_communities (id) on delete cascade,
  code         text not null unique check (code ~ '^[A-Z0-9]{2,6}-[A-Z2-9]{6}$'),
  label        text check (char_length(label) <= 80),
  auto_approve boolean not null default false,
  max_uses     int check (max_uses between 1 and 10000),
  uses         int not null default 0 check (uses >= 0),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  check (max_uses is null or uses <= max_uses)
);
create index invite_codes_community_idx on public.invite_codes (community_id, created_at desc);

create table public.invite_code_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid not null references public.invite_codes (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  outcome     text not null check (outcome in ('member', 'request')),
  redeemed_at timestamptz not null default now(),
  unique (code_id, user_id)
);

-- Attempt log for brute-force throttling. No client access at all.
create table public.invite_code_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index invite_code_attempts_idx on public.invite_code_attempts (user_id, attempted_at desc);

alter table public.invite_codes enable row level security;
alter table public.invite_code_redemptions enable row level security;
alter table public.invite_code_attempts enable row level security;
revoke all on public.invite_codes, public.invite_code_redemptions, public.invite_code_attempts from anon, authenticated;
grant select on public.invite_codes, public.invite_code_redemptions to authenticated;
create policy invite_codes_read on public.invite_codes for select to authenticated using (private.can('member.invite', community_id));
create policy redemptions_read on public.invite_code_redemptions for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.invite_codes c where c.id = code_id and private.can('member.invite', c.community_id)));

create function private.random_code(p_len int) returns text
language sql volatile set search_path = '' as $$
  -- 32-symbol alphabet (no 0/O/1/I); 256 is a multiple of 32, so byte % 32 is unbiased.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 32) + 1, 1), '')
  from (select extensions.gen_random_bytes(p_len) as b) r, generate_series(0, p_len - 1) i
$$;

create function public.create_invite_code(p_community_id uuid, p_label text default null, p_auto_approve boolean default false,
                                          p_max_uses int default null, p_expires_in_days int default 30)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_prefix text; v_code text; v_id uuid;
begin
  if not private.can('member.invite', p_community_id) then perform private.deny(); end if;
  if p_auto_approve and not private.can('membership.approve', p_community_id) then
    perform private.deny('only leaders who can approve members may create auto-verifying codes');
  end if;
  if p_expires_in_days is not null and (p_expires_in_days < 1 or p_expires_in_days > 365) then
    raise exception 'expiry must be between 1 and 365 days' using errcode = '22023';
  end if;
  if (select count(*) from public.invite_codes where community_id = p_community_id and revoked_at is null
      and (expires_at is null or expires_at > now())) >= 50 then
    raise exception 'too many active codes; revoke some first' using errcode = 'P0001';
  end if;
  select left(upper(regexp_replace(slug, '[^a-z0-9]', '', 'g')), 4) into v_prefix from public.class_communities where id = p_community_id;
  v_prefix := coalesce(nullif(v_prefix, ''), 'ALUM');
  loop
    v_code := v_prefix || '-' || private.random_code(6);
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;
  insert into public.invite_codes (community_id, code, label, auto_approve, max_uses, expires_at, created_by)
  values (p_community_id, v_code, nullif(trim(p_label), ''), coalesce(p_auto_approve, false), p_max_uses,
          case when p_expires_in_days is not null then now() + make_interval(days => p_expires_in_days) end, v_uid)
  returning id into v_id;
  perform private.audit('invite_code.created', 'community', p_community_id, 'invite_code', v_id,
    jsonb_build_object('label', p_label, 'auto_approve', p_auto_approve, 'max_uses', p_max_uses, 'expires_in_days', p_expires_in_days));
  return v_code;
end $$;

create function public.revoke_invite_code(p_code_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_cid uuid;
begin
  select community_id into v_cid from public.invite_codes where id = p_code_id;
  if v_cid is null or not private.can('member.invite', v_cid) then perform private.deny(); end if;
  update public.invite_codes set revoked_at = now() where id = p_code_id and revoked_at is null;
  perform private.audit('invite_code.revoked', 'community', v_cid, 'invite_code', p_code_id, '{}'::jsonb);
end $$;

-- Redeem: returns a status object instead of raising for bad codes, so failed attempts are recorded for throttling.
create function public.redeem_invite_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); k public.invite_codes; c public.class_communities; v_status text; v_name text;
begin
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'verify your email before using an invitation code' using errcode = '42501', hint = 'email_unverified';
  end if;
  if (select count(*) from public.invite_code_attempts where user_id = v_uid and not succeeded and attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many attempts; try again in an hour' using errcode = 'P0001';
  end if;
  select * into k from public.invite_codes
   where code = upper(trim(p_code)) and revoked_at is null and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
   for update;
  if k.id is null then
    insert into public.invite_code_attempts (user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into c from public.class_communities where id = k.community_id;
  insert into public.invite_code_attempts (user_id, succeeded) values (v_uid, true);
  if c.status <> 'active' then return jsonb_build_object('status', 'invalid'); end if;

  select status into v_status from public.memberships where community_id = c.id and user_id = v_uid;
  if v_status = 'active' then return jsonb_build_object('status', 'already_member', 'slug', c.slug, 'community', c.name, 'community_id', c.id); end if;
  if v_status = 'suspended' then perform private.deny('your membership in this community is suspended'); end if;
  if exists (select 1 from public.invite_code_redemptions where code_id = k.id and user_id = v_uid) then
    return jsonb_build_object('status', 'already_redeemed', 'slug', c.slug, 'community', c.name, 'community_id', c.id);
  end if;

  if k.auto_approve then
    insert into public.memberships (community_id, user_id, status, verification_method, verified_at, verified_by)
    values (c.id, v_uid, 'active', 'invitation_code', now(), k.created_by)
    on conflict (community_id, user_id) do update set status = 'active', verification_method = 'invitation_code',
      verified_at = now(), verified_by = k.created_by where public.memberships.status = 'left';
    update public.membership_requests set status = 'withdrawn' where community_id = c.id and user_id = v_uid and status = 'pending';
    insert into public.invite_code_redemptions (code_id, user_id, outcome) values (k.id, v_uid, 'member');
  else
    if not exists (select 1 from public.membership_requests where community_id = c.id and user_id = v_uid and status = 'pending') then
      select case when char_length(full_name) >= 2 then full_name else 'Invited member' end into v_name from public.profiles where id = v_uid;
      insert into public.membership_requests (community_id, user_id, name_at_graduation, note)
      values (c.id, v_uid, coalesce(v_name, 'Invited member'), 'Joined with invitation code' || coalesce(' "' || k.label || '"', ''));
      perform private.notify_holders('membership.review', 'community', c.id, 'membership.requested',
        'New membership request (invitation code)', coalesce(v_name, 'A classmate') || ' used code ' || k.code, '/admin/approvals', array[v_uid]);
    end if;
    insert into public.invite_code_redemptions (code_id, user_id, outcome) values (k.id, v_uid, 'request');
  end if;
  update public.invite_codes set uses = uses + 1 where id = k.id;
  perform private.audit('invite_code.redeemed', 'community', c.id, 'invite_code', k.id,
    jsonb_build_object('user_id', v_uid, 'outcome', case when k.auto_approve then 'member' else 'request' end));
  return jsonb_build_object('status', case when k.auto_approve then 'joined' else 'requested' end, 'slug', c.slug, 'community', c.name, 'community_id', c.id);
end $$;

---------------------------------------------------------------------------
-- Function privileges
---------------------------------------------------------------------------
revoke execute on function
  public.request_affiliation(uuid, uuid, text), public.decide_affiliation(uuid, boolean, text), public.revoke_affiliation(uuid, text),
  public.institution_network_stats(uuid), public.create_invite_code(uuid, text, boolean, int, int), public.revoke_invite_code(uuid),
  public.redeem_invite_code(text)
from public, anon;
grant execute on function
  public.request_affiliation(uuid, uuid, text), public.decide_affiliation(uuid, boolean, text), public.revoke_affiliation(uuid, text),
  public.institution_network_stats(uuid), public.create_invite_code(uuid, text, boolean, int, int), public.revoke_invite_code(uuid),
  public.redeem_invite_code(text)
to authenticated;
revoke execute on function private.affiliate_on_create(), private.random_code(int), private.can_decide_affiliation(uuid) from public;
