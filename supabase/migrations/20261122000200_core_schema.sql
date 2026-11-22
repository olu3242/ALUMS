-- ALUMS core schema: tenancy, RBAC catalog, profiles, community content.
-- Every tenant-owned row carries community_id; isolation is enforced by RLS (see 0300).

---------------------------------------------------------------------------
-- Tenancy
---------------------------------------------------------------------------
create table public.institutions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 200),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  country     text check (char_length(country) <= 80),
  city        text check (char_length(city) <= 80),
  website_url text check (website_url ~ '^https://' and char_length(website_url) <= 300),
  status      public.institution_status not null default 'unverified',
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index institutions_name_key on public.institutions (lower(name));

create table public.departments (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 120),
  created_at     timestamptz not null default now()
);
create unique index departments_name_key on public.departments (institution_id, lower(name));

create table public.class_communities (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name            text not null check (char_length(name) between 2 and 160),
  institution_id  uuid references public.institutions (id) on delete restrict,
  department_id   uuid references public.departments (id) on delete set null,
  department_name text not null check (char_length(department_name) between 2 and 120),
  graduation_year int  not null check (graduation_year between 1900 and 2100),
  description     text check (char_length(description) <= 2000),
  status          public.community_status not null default 'pending_verification',
  is_founding     boolean not null default false,
  verified_at     timestamptz,
  verified_by     uuid references auth.users (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index class_communities_identity_key
  on public.class_communities (institution_id, lower(department_name), graduation_year)
  where institution_id is not null;
create index class_communities_discovery_idx on public.class_communities (graduation_year, lower(department_name)) where status = 'active';

create table public.memberships (
  id                  uuid primary key default gen_random_uuid(),
  community_id        uuid not null references public.class_communities (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  status              public.membership_status not null default 'active',
  verification_method text not null check (verification_method in ('request_review', 'invitation', 'bootstrap')),
  verified_at         timestamptz not null default now(),
  verified_by         uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (community_id, user_id)
);
create index memberships_user_active_idx on public.memberships (user_id, community_id) where status = 'active';
create index memberships_community_idx on public.memberships (community_id, status);

create table public.membership_requests (
  id                 uuid primary key default gen_random_uuid(),
  community_id       uuid not null references public.class_communities (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  status             public.request_status not null default 'pending',
  name_at_graduation text not null check (char_length(name_at_graduation) between 2 and 160),
  student_identifier text check (char_length(student_identifier) <= 64),
  note               text check (char_length(note) <= 1000),
  reviewed_by        uuid references auth.users (id) on delete set null,
  reviewed_at        timestamptz,
  decision_note      text check (char_length(decision_note) <= 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index membership_requests_one_pending on public.membership_requests (community_id, user_id) where status = 'pending';
create index membership_requests_queue_idx on public.membership_requests (community_id, status, created_at);

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.class_communities (id) on delete cascade,
  email        text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash   text not null unique,
  invited_by   uuid not null references auth.users (id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index invitations_community_idx on public.invitations (community_id, created_at desc);

create table public.community_requests (
  id                    uuid primary key default gen_random_uuid(),
  requested_by          uuid not null references auth.users (id) on delete cascade,
  institution_name      text not null check (char_length(institution_name) between 2 and 200),
  department_name       text not null check (char_length(department_name) between 2 and 120),
  graduation_year       int  not null check (graduation_year between 1900 and 2100),
  note                  text check (char_length(note) <= 1000),
  status                public.request_status not null default 'pending',
  resolved_community_id uuid references public.class_communities (id) on delete set null,
  reviewed_by           uuid references auth.users (id) on delete set null,
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now()
);

---------------------------------------------------------------------------
-- RBAC
---------------------------------------------------------------------------
create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description text not null
);

create table public.roles (
  key               text primary key check (key ~ '^[a-z_]+$'),
  name              text not null,
  description       text not null,
  scope_type        public.scope_type not null,
  rank              int not null check (rank between 1 and 100),
  requires_approval boolean not null default false,
  is_financial      boolean not null default false,
  assignable        boolean not null default true
);

create table public.role_permissions (
  role_key       text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

-- Separation of duties: a user may not hold both roles in the same scope.
create table public.role_conflicts (
  role_a text not null references public.roles (key) on delete cascade,
  role_b text not null references public.roles (key) on delete cascade,
  reason text not null,
  primary key (role_a, role_b),
  check (role_a < role_b)
);

create table public.role_assignments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  role_key            text not null references public.roles (key),
  scope_type          public.scope_type not null,
  scope_id            uuid,
  status              public.assignment_status not null,
  reason              text check (char_length(reason) <= 500),
  assigned_by         uuid references auth.users (id) on delete set null,
  approval_request_id uuid,
  activated_at        timestamptz,
  expires_at          timestamptz,
  revoked_at          timestamptz,
  revoked_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((scope_type = 'platform') = (scope_id is null))
);
create unique index role_assignments_live_key
  on public.role_assignments (user_id, role_key, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('pending_approval', 'active');
create index role_assignments_user_active_idx on public.role_assignments (user_id) where status = 'active';
create index role_assignments_scope_idx on public.role_assignments (scope_type, scope_id, status);

create table public.approval_requests (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('role_assignment')),
  scope_type     public.scope_type not null,
  scope_id       uuid,
  subject_id     uuid not null,
  target_user_id uuid references auth.users (id) on delete cascade,
  payload        jsonb not null default '{}'::jsonb,
  requested_by   uuid not null references auth.users (id) on delete cascade,
  status         public.approval_status not null default 'pending',
  decided_by     uuid references auth.users (id) on delete set null,
  decided_at     timestamptz,
  decision_note  text check (char_length(decision_note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- BR-7: critical changes are independently approved.
  check (decided_by is null or (decided_by <> requested_by and decided_by is distinct from target_user_id))
);
create index approval_requests_queue_idx on public.approval_requests (scope_type, scope_id, status);

create table public.platform_settings (
  key        text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)*$'),
  value      jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

---------------------------------------------------------------------------
-- People
---------------------------------------------------------------------------
create function private.valid_visibility(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each_text(p) e
    where e.key not in ('full_name','name_at_graduation','headline','about','profession','industry',
                        'employer','job_title','contact_email','phone','linkedin_url','website_url')
       or e.value not in ('everyone','members','connections','private')
  )
$$;

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text not null default '' check (char_length(full_name) <= 120),
  name_at_graduation text check (char_length(name_at_graduation) <= 160),
  headline           text check (char_length(headline) <= 160),
  about              text check (char_length(about) <= 2000),
  profession         text check (char_length(profession) <= 100),
  industry           text check (char_length(industry) <= 100),
  employer           text check (char_length(employer) <= 120),
  job_title          text check (char_length(job_title) <= 120),
  contact_email      text check (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone              text check (char_length(phone) <= 40),
  linkedin_url       text check (char_length(linkedin_url) <= 300 and linkedin_url ~ '^https://'),
  website_url        text check (char_length(website_url) <= 300 and website_url ~ '^https://'),
  open_to_mentoring  boolean not null default false,
  directory_listed   boolean not null default true,
  -- Per-field visibility; a missing key is treated as 'private' (privacy by default).
  visibility         jsonb not null default '{
    "full_name":"members","name_at_graduation":"members","headline":"members","about":"members",
    "profession":"members","industry":"members","employer":"members","job_title":"members",
    "linkedin_url":"members","website_url":"members","contact_email":"private","phone":"private"}'::jsonb
    check (private.valid_visibility(visibility)),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- City-level only. Precise addresses are never stored (FR-6).
create table public.locations (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  country     text check (char_length(country) <= 80),
  city        text check (char_length(city) <= 80),
  share_level public.location_share not null default 'hidden',
  consent_at  timestamptz,
  updated_at  timestamptz not null default now(),
  check (share_level = 'hidden' or consent_at is not null),
  check (share_level = 'hidden' or country is not null),
  check (share_level <> 'city' or city is not null)
);

create table public.connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       public.connection_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index connections_pair_key on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id, status);

---------------------------------------------------------------------------
-- Community content
---------------------------------------------------------------------------
create table public.business_categories (
  id   uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null unique
);

create table public.businesses (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid not null references public.class_communities (id) on delete cascade,
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id    uuid references public.business_categories (id) on delete set null,
  name           text not null check (char_length(name) between 2 and 120),
  description    text check (char_length(description) <= 2000),
  services       text[] not null default '{}' check (cardinality(services) <= 20),
  website_url    text check (char_length(website_url) <= 300 and website_url ~ '^https://'),
  contact_email  text check (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone          text check (char_length(phone) <= 40),
  country        text check (char_length(country) <= 80),
  city           text check (char_length(city) <= 80),
  status         public.business_status not null default 'draft',
  owner_verified boolean not null default false,
  submitted_at   timestamptz,
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text check (char_length(review_note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index businesses_listing_idx on public.businesses (community_id, status);
create index businesses_owner_idx on public.businesses (owner_id);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.class_communities (id) on delete cascade,
  title        text not null check (char_length(title) between 2 and 160),
  description  text check (char_length(description) <= 5000),
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  timezone     text not null default 'UTC' check (char_length(timezone) <= 64),
  venue        text check (char_length(venue) <= 200),
  is_virtual   boolean not null default false,
  meeting_url  text check (char_length(meeting_url) <= 300 and meeting_url ~ '^https://'),
  capacity     int check (capacity > 0),
  status       public.event_status not null default 'draft',
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index events_community_idx on public.events (community_id, starts_at);

create table public.event_rsvps (
  event_id      uuid not null references public.events (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status        public.rsvp_status not null,
  attended      boolean not null default false,
  checked_in_by uuid references auth.users (id) on delete set null,
  checked_in_at timestamptz,
  reminded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.class_communities (id) on delete cascade,
  title        text not null check (char_length(title) between 2 and 160),
  body         text not null check (char_length(body) between 1 and 10000),
  is_pinned    boolean not null default false,
  author_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index announcements_feed_idx on public.announcements (community_id, is_pinned desc, published_at desc);

create table public.albums (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.class_communities (id) on delete cascade,
  event_id     uuid references public.events (id) on delete set null,
  title        text not null check (char_length(title) between 2 and 120),
  description  text check (char_length(description) <= 1000),
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index albums_community_idx on public.albums (community_id, created_at desc);

create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.class_communities (id) on delete cascade,
  album_id     uuid not null references public.albums (id) on delete cascade,
  uploader_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  bytes        int  not null check (bytes between 1 and 5242880),
  caption      text check (char_length(caption) <= 300),
  status       public.media_status not null default 'published',
  created_at   timestamptz not null default now(),
  check (storage_path like community_id::text || '/%')
);
create index media_assets_album_idx on public.media_assets (album_id, created_at desc);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  community_id uuid references public.class_communities (id) on delete cascade,
  kind         text not null check (kind ~ '^[a-z_]+(\.[a-z_]+)*$'),
  title        text not null check (char_length(title) <= 200),
  body         text check (char_length(body) <= 1000),
  link         text check (link ~ '^/[A-Za-z0-9/_\-?=&.%]*$'),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_inbox_idx on public.notifications (user_id, read_at, created_at desc);

create table public.moderation_reports (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.class_communities (id) on delete cascade,
  reporter_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_type     text not null check (target_type in ('business', 'event', 'announcement', 'media', 'profile')),
  target_id       uuid not null,
  reason          text not null check (char_length(reason) between 3 and 1000),
  status          public.report_status not null default 'open',
  resolved_by     uuid references auth.users (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text check (char_length(resolution_note) <= 1000),
  created_at      timestamptz not null default now()
);
create index moderation_reports_queue_idx on public.moderation_reports (community_id, status, created_at);

---------------------------------------------------------------------------
-- updated_at triggers
---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['institutions','class_communities','memberships','membership_requests','role_assignments',
                           'approval_requests','profiles','businesses','events','event_rsvps','announcements']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

---------------------------------------------------------------------------
-- Integrity triggers (cross-community consistency, review state)
---------------------------------------------------------------------------
create function private.media_album_consistency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.albums a where a.id = new.album_id and a.community_id = new.community_id) then
    raise exception 'album does not belong to this community' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger media_album_consistency before insert or update on public.media_assets
  for each row execute function private.media_album_consistency();

create function private.album_event_consistency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is not null and not exists (select 1 from public.events e where e.id = new.event_id and e.community_id = new.community_id) then
    raise exception 'event does not belong to this community' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger album_event_consistency before insert or update on public.albums
  for each row execute function private.album_event_consistency();

-- Editing an approved/rejected listing's content sends it back to review.
create function private.business_content_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('approved', 'rejected') and (
       new.name, new.description, new.services, new.category_id, new.website_url,
       new.contact_email, new.phone, new.country, new.city)
     is distinct from (
       old.name, old.description, old.services, old.category_id, old.website_url,
       old.contact_email, old.phone, old.country, old.city) then
    new.status := 'submitted';
    new.submitted_at := now();
    new.reviewed_by := null; new.reviewed_at := null; new.owner_verified := false;
  end if;
  return new;
end $$;
create trigger business_content_change before update on public.businesses
  for each row execute function private.business_content_change();

create function private.rsvp_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cap int; v_going int;
begin
  if new.status <> 'going' or (tg_op = 'UPDATE' and old.status = 'going') then return new; end if;
  select capacity into v_cap from public.events where id = new.event_id for update;
  if v_cap is null then return new; end if;
  select count(*) into v_going from public.event_rsvps where event_id = new.event_id and status = 'going';
  if v_going >= v_cap then raise exception 'event is at capacity' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger rsvp_capacity before insert or update of status on public.event_rsvps
  for each row execute function private.rsvp_capacity();

-- New auth user → profile + hidden location row.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120))
  on conflict (id) do nothing;
  insert into public.locations (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
