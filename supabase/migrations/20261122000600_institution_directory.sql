-- Institution directory: a global reference catalogue for lookup/autocomplete.
-- It is NOT the verified `institutions` table. Picking a directory entry only fills in the official name;
-- an institution becomes a verified ALUMS tenant only through create_institution (platform admins, audited).
create extension if not exists pg_trgm with schema extensions;

create table public.institution_directory (
  id             bigint generated always as identity primary key,
  name           text not null check (char_length(name) between 2 and 200),
  country        text not null check (char_length(country) between 2 and 80),
  country_code   text check (country_code ~ '^[A-Z]{2}$'),
  state_province text check (char_length(state_province) <= 120),
  website_url    text check (char_length(website_url) <= 300),
  kind           text not null default 'university' check (kind in ('university', 'polytechnic', 'college', 'other')),
  source         text not null check (source in ('hipo', 'curated')),
  updated_at     timestamptz not null default now()
);
create unique index institution_directory_identity_key on public.institution_directory (lower(name), country);
create index institution_directory_name_trgm on public.institution_directory using gin (name extensions.gin_trgm_ops);
create index institution_directory_country_idx on public.institution_directory (country);

alter table public.institution_directory enable row level security;
create policy directory_read on public.institution_directory for select to anon, authenticated using (true);
grant select on public.institution_directory to anon, authenticated;

-- Link verified institutions and alumni requests back to the catalogue entry they came from.
alter table public.institutions add column directory_id bigint references public.institution_directory (id) on delete set null;
alter table public.community_requests add column institution_directory_id bigint references public.institution_directory (id) on delete set null;
create index institutions_directory_idx on public.institutions (directory_id);
create index community_requests_directory_idx on public.community_requests (institution_directory_id);

-- Lookup: prefix matches first, then substring, then fuzzy (trigram) matches. Anonymous-safe (public reference data).
create function public.search_institution_directory(p_query text, p_country text default null, p_limit int default 10)
returns table (id bigint, name text, country text, country_code text, state_province text, website_url text, kind text)
language sql stable security invoker set search_path = '' as $$
  with q as (select nullif(trim(p_query), '') as t, nullif(trim(p_country), '') as c)
  select d.id, d.name, d.country, d.country_code, d.state_province, d.website_url, d.kind
  from public.institution_directory d, q
  where q.t is not null and char_length(q.t) >= 2
    and (q.c is null or d.country = q.c)
    and (d.name ilike private.like_pattern(q.t) or extensions.word_similarity(q.t, d.name) > 0.45)
  order by (d.name ilike q.t || '%') desc,
           (d.name ilike private.like_pattern(q.t)) desc,
           extensions.word_similarity(q.t, d.name) desc,
           d.name
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
$$;

create function public.institution_directory_countries()
returns table (country text, country_code text, institutions bigint)
language sql stable security invoker set search_path = '' as $$
  select country, max(country_code), count(*) from public.institution_directory group by country order by country
$$;

-- request_community gains an optional catalogue reference (signature change → drop & recreate).
drop function public.request_community(text, text, int, text);
create function public.request_community(p_institution_name text, p_department_name text, p_graduation_year int,
                                         p_note text default null, p_institution_directory_id bigint default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid; v_name text := trim(p_institution_name);
begin
  if (select count(*) from public.community_requests where requested_by = v_uid and status = 'pending') >= 3 then
    raise exception 'you already have 3 pending community requests' using errcode = 'P0001';
  end if;
  if p_institution_directory_id is not null then  -- trust the catalogue's official name over typed text
    select name into v_name from public.institution_directory where id = p_institution_directory_id;
    if v_name is null then raise exception 'unknown institution' using errcode = 'P0002'; end if;
  end if;
  insert into public.community_requests (requested_by, institution_name, department_name, graduation_year, note, institution_directory_id)
  values (v_uid, v_name, trim(p_department_name), p_graduation_year, nullif(trim(p_note), ''), p_institution_directory_id)
  returning id into v_id;
  perform private.audit('community.requested', 'platform', null, 'community_request', v_id,
    jsonb_build_object('institution', v_name, 'department', p_department_name, 'year', p_graduation_year, 'directory_id', p_institution_directory_id));
  perform private.notify_holders('community.create', 'platform', null, 'community.requested', 'New class community request',
    p_department_name || ' — Class of ' || p_graduation_year || ' · ' || v_name, '/admin/communities', array[v_uid]);
  return v_id;
end $$;

-- create_institution can start from a catalogue entry (name/country/website prefilled, link kept).
drop function public.create_institution(text, text, text, text, boolean);
create function public.create_institution(p_name text, p_country text default null, p_city text default null,
                                          p_website_url text default null, p_verified boolean default false,
                                          p_directory_id bigint default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid; d public.institution_directory;
begin
  if not private.has_permission('institution.manage') then perform private.deny(); end if;
  perform private.require_mfa();
  if p_directory_id is not null then
    select * into d from public.institution_directory where id = p_directory_id;
    if d.id is null then raise exception 'unknown directory entry' using errcode = 'P0002'; end if;
  end if;
  insert into public.institutions (name, slug, country, city, website_url, status, verified_at, verified_by, created_by, directory_id)
  values (coalesce(d.name, trim(p_name)), private.slugify(coalesce(d.name, p_name)), coalesce(nullif(trim(p_country), ''), d.country),
          nullif(trim(p_city), ''),
          coalesce(nullif(trim(p_website_url), ''), case when d.website_url ~ '^https://' then rtrim(d.website_url, '/') end),
          case when p_verified then 'verified'::public.institution_status else 'unverified'::public.institution_status end,
          case when p_verified then now() end, case when p_verified then v_uid end, v_uid, d.id)
  returning id into v_id;
  perform private.audit('institution.created', 'platform', null, 'institution', v_id,
    jsonb_build_object('name', coalesce(d.name, p_name), 'verified', p_verified, 'directory_id', d.id));
  return v_id;
end $$;

revoke execute on function public.request_community(text, text, int, text, bigint) from public, anon;
revoke execute on function public.create_institution(text, text, text, text, boolean, bigint) from public, anon;
revoke execute on function public.search_institution_directory(text, text, int), public.institution_directory_countries() from public;
grant execute on function public.request_community(text, text, int, text, bigint), public.create_institution(text, text, text, text, boolean, bigint) to authenticated;
grant execute on function public.search_institution_directory(text, text, int), public.institution_directory_countries() to anon, authenticated;
