-- Per-class modules (on/off) and invitation management.
-- A missing row means "enabled", so existing classes keep everything. Platform admins can lock a module
-- (class admins then can't change it). Turning a module off hides it; existing data is kept, never deleted.
create table public.community_features (
  community_id uuid not null references public.class_communities (id) on delete cascade,
  feature      text not null check (feature in ('alumni', 'businesses', 'locations', 'events', 'gallery', 'announcements', 'dues', 'network')),
  enabled      boolean not null default true,
  locked       boolean not null default false,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (community_id, feature)
);
alter table public.community_features enable row level security;
create policy community_features_read on public.community_features for select to authenticated
  using (private.is_member(community_id) or private.can('community.view_admin', community_id));
grant select on public.community_features to authenticated;  -- writes only through set_community_feature

create function private.feature_enabled(p_community_id uuid, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.community_features where community_id = p_community_id and feature = p_feature), true)
$$;
grant execute on function private.feature_enabled(uuid, text) to authenticated;

create function public.set_community_feature(p_community_id uuid, p_feature text, p_enabled boolean, p_locked boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); f public.community_features; v_platform boolean := private.has_permission('community.create');
begin
  if not private.can('community.manage', p_community_id) then perform private.deny(); end if;
  if not exists (select 1 from public.class_communities where id = p_community_id) then raise exception 'community not found' using errcode = 'P0002'; end if;
  if p_feature not in ('alumni', 'businesses', 'locations', 'events', 'gallery', 'announcements', 'dues', 'network') then
    raise exception 'unknown feature' using errcode = '22023';
  end if;
  select * into f from public.community_features where community_id = p_community_id and feature = p_feature for update;
  if p_locked is not null and p_locked is distinct from coalesce(f.locked, false) and not v_platform then
    perform private.deny('only platform admins can lock or unlock a feature');
  end if;
  if coalesce(f.locked, false) and not v_platform and p_enabled is distinct from f.enabled then
    perform private.deny('this feature is locked by the platform team');
  end if;
  perform private.require_mfa();
  insert into public.community_features (community_id, feature, enabled, locked, updated_by)
  values (p_community_id, p_feature, p_enabled, coalesce(p_locked, false), v_uid)
  on conflict (community_id, feature) do update set enabled = excluded.enabled,
    locked = coalesce(p_locked, public.community_features.locked), updated_by = v_uid, updated_at = now();
  perform private.audit('community.feature_changed', 'community', p_community_id, 'community', p_community_id,
    jsonb_build_object('feature', p_feature, 'enabled', p_enabled, 'locked', coalesce(p_locked, f.locked, false)));
end $$;
revoke all on function public.set_community_feature(uuid, text, boolean, boolean) from public;
grant execute on function public.set_community_feature(uuid, text, boolean, boolean) to authenticated;

-- Invitations: leaders can see them (existing invitations_read policy) and now revoke pending ones.
create function public.revoke_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); i public.invitations;
begin
  select * into i from public.invitations where id = p_invitation_id for update;
  if i.id is null then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  if not private.can('member.invite', i.community_id) then perform private.deny(); end if;
  if i.accepted_at is not null then raise exception 'this invitation was already accepted' using errcode = 'P0001'; end if;
  if i.revoked_at is not null then return; end if;
  update public.invitations set revoked_at = now() where id = i.id;
  perform private.audit('membership.invitation_revoked', 'community', i.community_id, 'invitation', i.id, jsonb_build_object('email', i.email));
end $$;
revoke all on function public.revoke_invitation(uuid) from public;
grant execute on function public.revoke_invitation(uuid) to authenticated;
