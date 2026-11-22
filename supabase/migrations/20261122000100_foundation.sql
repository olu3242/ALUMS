-- ALUMS foundation: schemas, extensions, enums, append-only audit log, shared utilities.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create type public.scope_type         as enum ('platform', 'institution', 'community');
create type public.visibility_level   as enum ('everyone', 'members', 'connections', 'private');
create type public.institution_status as enum ('unverified', 'verified', 'archived');
create type public.community_status   as enum ('pending_verification', 'active', 'archived');
create type public.membership_status  as enum ('active', 'suspended', 'left');
create type public.request_status     as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type public.assignment_status  as enum ('pending_approval', 'active', 'rejected', 'revoked');
create type public.approval_status    as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.business_status    as enum ('draft', 'submitted', 'approved', 'rejected', 'suspended');
create type public.event_status       as enum ('draft', 'published', 'cancelled');
create type public.rsvp_status        as enum ('going', 'maybe', 'declined');
create type public.report_status      as enum ('open', 'actioned', 'dismissed');
create type public.connection_status  as enum ('pending', 'accepted', 'declined');
create type public.location_share     as enum ('hidden', 'country', 'city');
create type public.media_status       as enum ('published', 'hidden');

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- Escape LIKE metacharacters in user-provided search input.
create function private.like_pattern(p text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin return p::uuid; exception when others then return null; end $$;

create function private.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Append-only audit log. Writes only through private.audit() (SECURITY DEFINER callers).
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  action      text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  scope_type  public.scope_type not null,
  scope_id    uuid,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb
);
create index audit_logs_scope_idx on public.audit_logs (scope_type, scope_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

create function private.audit_logs_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_logs is append-only' using errcode = '42501'; end $$;

create trigger audit_logs_no_mutation before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.audit_logs_immutable();

create function private.audit(
  p_action text, p_scope_type public.scope_type, p_scope_id uuid,
  p_target_type text, p_target_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, scope_type, scope_id, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_scope_type, p_scope_id, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;
