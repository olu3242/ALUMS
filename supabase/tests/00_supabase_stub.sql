-- Minimal stand-in for the Supabase platform schemas so migrations and RLS run on plain PostgreSQL in CI.
-- NOT applied to Supabase projects.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create schema storage;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant usage on schema auth, extensions, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
-- Supabase default privileges (anon/authenticated get table grants; RLS is the guard).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
