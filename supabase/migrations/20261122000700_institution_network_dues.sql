-- Institution branding + alumni network (posts, linkages) + membership dues.
-- Conventions: RLS on every table, explicit grants, privileged writes via audited RPCs, MFA for financial actions.

---------------------------------------------------------------------------
-- Institution branding
---------------------------------------------------------------------------
alter table public.institutions
  add column logo_path     text check (char_length(logo_path) <= 300),
  add column logo_format   text not null default 'mark' check (logo_format in ('mark', 'wordmark')),
  add column brand_primary text check (brand_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add column brand_accent  text check (brand_accent ~ '^#[0-9A-Fa-f]{6}$'),
  add column tagline       text check (char_length(tagline) <= 160),
  add column about         text check (char_length(about) <= 2000),
  add column public_page   boolean not null default true,
  add constraint institutions_logo_path_scoped check (logo_path is null or logo_path like id::text || '/%');

grant select (logo_path, logo_format, brand_primary, brand_accent, tagline, about, public_page) on public.institutions to anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('institution-assets', 'institution-assets', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy institution_assets_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'institution-assets'
              and private.has_permission('institution.brand', 'institution', private.try_uuid((storage.foldername(name))[1])));
create policy institution_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'institution-assets'
         and private.has_permission('institution.brand', 'institution', private.try_uuid((storage.foldername(name))[1])));

create function public.update_institution_branding(
  p_institution_id uuid, p_tagline text default null, p_about text default null, p_brand_primary text default null,
  p_brand_accent text default null, p_logo_format text default 'mark', p_logo_path text default null, p_public_page boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth();
begin
  if not private.has_permission('institution.brand', 'institution', p_institution_id) then perform private.deny(); end if;
  if p_logo_path is not null and p_logo_path not like p_institution_id::text || '/%' then
    raise exception 'logo must be uploaded for this institution' using errcode = '22023';
  end if;
  update public.institutions set
    tagline = nullif(trim(p_tagline), ''), about = nullif(trim(p_about), ''),
    brand_primary = upper(nullif(trim(p_brand_primary), '')), brand_accent = upper(nullif(trim(p_brand_accent), '')),
    logo_format = coalesce(p_logo_format, 'mark'), logo_path = coalesce(p_logo_path, logo_path), public_page = coalesce(p_public_page, true)
  where id = p_institution_id;
  if not found then raise exception 'institution not found' using errcode = 'P0002'; end if;
  perform private.audit('institution.branding_updated', 'institution', p_institution_id, 'institution', p_institution_id,
    jsonb_build_object('primary', p_brand_primary, 'accent', p_brand_accent, 'format', p_logo_format, 'logo_changed', p_logo_path is not null));
end $$;

---------------------------------------------------------------------------
-- Alumni network: institution posts (news/opportunities) and linkages (partners, associations, chapters)
---------------------------------------------------------------------------
create function private.is_institution_alumnus(p_institution_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m join public.class_communities c on c.id = m.community_id
                 where c.institution_id = p_institution_id and m.user_id = (select auth.uid()) and m.status = 'active')
$$;

create function private.institution_public(p_institution_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.institutions i where i.id = p_institution_id and i.status = 'verified' and i.public_page)
$$;

create table public.institution_posts (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  kind           text not null check (kind in ('news', 'opportunity', 'event', 'spotlight')),
  audience       text not null default 'alumni' check (audience in ('public', 'alumni')),
  title          text not null check (char_length(title) between 2 and 160),
  body           text not null check (char_length(body) between 1 and 5000),
  link_url       text check (char_length(link_url) <= 300 and link_url ~ '^https://'),
  status         text not null default 'published' check (status in ('published', 'hidden')),
  author_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  published_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index institution_posts_feed_idx on public.institution_posts (institution_id, status, published_at desc);
create trigger institution_posts_touch before update on public.institution_posts for each row execute function private.touch_updated_at();

create table public.institution_links (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  kind           text not null check (kind in ('partner', 'association', 'chapter', 'social', 'other')),
  name           text not null check (char_length(name) between 2 and 120),
  url            text check (char_length(url) <= 300 and url ~ '^https://'),
  description    text check (char_length(description) <= 500),
  sort_order     int not null default 0,
  created_by     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index institution_links_idx on public.institution_links (institution_id, sort_order);

alter table public.institution_posts enable row level security;
alter table public.institution_links enable row level security;
revoke all on public.institution_posts, public.institution_links from anon, authenticated;
grant select on public.institution_posts, public.institution_links to anon, authenticated;
grant insert (institution_id, kind, audience, title, body, link_url, status) on public.institution_posts to authenticated;
grant update (kind, audience, title, body, link_url, status) on public.institution_posts to authenticated;
grant delete on public.institution_posts to authenticated;
grant insert (institution_id, kind, name, url, description, sort_order) on public.institution_links to authenticated;
grant update (kind, name, url, description, sort_order) on public.institution_links to authenticated;
grant delete on public.institution_links to authenticated;

create policy posts_read on public.institution_posts for select to anon, authenticated
  using ((status = 'published' and audience = 'public' and private.institution_public(institution_id))
      or (status = 'published' and audience = 'alumni' and private.is_institution_alumnus(institution_id))
      or private.has_permission('institution.network', 'institution', institution_id));
create policy posts_write on public.institution_posts for insert to authenticated
  with check (author_id = (select auth.uid()) and private.has_permission('institution.network', 'institution', institution_id));
create policy posts_edit on public.institution_posts for update to authenticated
  using (private.has_permission('institution.network', 'institution', institution_id))
  with check (private.has_permission('institution.network', 'institution', institution_id));
create policy posts_delete on public.institution_posts for delete to authenticated
  using (private.has_permission('institution.network', 'institution', institution_id));

create policy links_read on public.institution_links for select to anon, authenticated
  using (private.institution_public(institution_id) or private.is_institution_alumnus(institution_id)
         or private.has_permission('institution.network', 'institution', institution_id));
create policy links_write on public.institution_links for insert to authenticated
  with check (created_by = (select auth.uid()) and private.has_permission('institution.network', 'institution', institution_id));
create policy links_edit on public.institution_links for update to authenticated
  using (private.has_permission('institution.network', 'institution', institution_id))
  with check (private.has_permission('institution.network', 'institution', institution_id));
create policy links_delete on public.institution_links for delete to authenticated
  using (private.has_permission('institution.network', 'institution', institution_id));

create function private.audit_institution_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  perform private.audit(tg_argv[0] || '.' || lower(tg_op), 'institution', (v ->> 'institution_id')::uuid, tg_argv[0], (v ->> 'id')::uuid,
    jsonb_strip_nulls(jsonb_build_object('title', v ->> 'title', 'name', v ->> 'name', 'audience', v ->> 'audience')));
  return null;
end $$;
create trigger institution_posts_audit after insert or update or delete on public.institution_posts
  for each row execute function private.audit_institution_content('institution_post');
create trigger institution_links_audit after insert or update or delete on public.institution_links
  for each row execute function private.audit_institution_content('institution_link');

---------------------------------------------------------------------------
-- Membership dues (finance.manage = Class Treasurer; separated from Class Admin by SoD rule)
---------------------------------------------------------------------------
create table public.dues_plans (
  id                   uuid primary key default gen_random_uuid(),
  community_id         uuid not null references public.class_communities (id) on delete cascade,
  name                 text not null check (char_length(name) between 2 and 120),
  description          text check (char_length(description) <= 1000),
  amount_minor         bigint not null check (amount_minor > 0 and amount_minor <= 100000000000),
  currency             text not null check (currency ~ '^[A-Z]{3}$'),
  period               text not null check (period in ('one_time', 'monthly', 'quarterly', 'annual')),
  due_date             date,
  payment_instructions text check (char_length(payment_instructions) <= 2000),
  payment_url          text check (char_length(payment_url) <= 300 and payment_url ~ '^https://'),
  status               text not null default 'active' check (status in ('active', 'archived')),
  created_by           uuid not null references auth.users (id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index dues_plans_community_idx on public.dues_plans (community_id, status);
create trigger dues_plans_touch before update on public.dues_plans for each row execute function private.touch_updated_at();

create table public.dues_payments (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.dues_plans (id) on delete restrict,
  community_id  uuid not null references public.class_communities (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  amount_minor  bigint not null check (amount_minor > 0),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  period_label  text check (char_length(period_label) <= 40),
  method        text not null check (method in ('bank_transfer', 'card', 'cash', 'mobile_money', 'other')),
  reference     text check (char_length(reference) <= 120),
  note          text check (char_length(note) <= 500),
  status        text not null check (status in ('pending', 'confirmed', 'rejected', 'voided')),
  submitted_by  uuid not null references auth.users (id) on delete cascade,
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  created_at    timestamptz not null default now(),
  -- Independent confirmation: nobody confirms their own payment (BR-7).
  check (decided_by is null or decided_by <> user_id)
);
create index dues_payments_plan_idx on public.dues_payments (plan_id, status);
create index dues_payments_user_idx on public.dues_payments (user_id, community_id);

alter table public.dues_plans enable row level security;
alter table public.dues_payments enable row level security;
revoke all on public.dues_plans, public.dues_payments from anon, authenticated;
grant select on public.dues_plans, public.dues_payments to authenticated;

create policy dues_plans_read on public.dues_plans for select to authenticated
  using ((status = 'active' and private.is_member(community_id)) or private.can('finance.view', community_id));
create policy dues_payments_read on public.dues_payments for select to authenticated
  using (user_id = (select auth.uid()) or private.can('finance.view', community_id));

create function public.create_dues_plan(
  p_community_id uuid, p_name text, p_amount_minor bigint, p_currency text, p_period text, p_due_date date default null,
  p_description text default null, p_payment_instructions text default null, p_payment_url text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_id uuid;
begin
  if not private.can('finance.manage', p_community_id) then perform private.deny(); end if;
  perform private.require_mfa();
  insert into public.dues_plans (community_id, name, description, amount_minor, currency, period, due_date, payment_instructions, payment_url, created_by)
  values (p_community_id, trim(p_name), nullif(trim(p_description), ''), p_amount_minor, upper(p_currency), p_period, p_due_date,
          nullif(trim(p_payment_instructions), ''), nullif(trim(p_payment_url), ''), v_uid)
  returning id into v_id;
  perform private.audit('dues.plan_created', 'community', p_community_id, 'dues_plan', v_id,
    jsonb_build_object('name', p_name, 'amount_minor', p_amount_minor, 'currency', upper(p_currency), 'period', p_period));
  perform private.notify(m.user_id, p_community_id, 'dues.plan_created', 'New class dues: ' || trim(p_name),
    'See amount, due date and how to pay.', '/app/dues')
  from public.memberships m where m.community_id = p_community_id and m.status = 'active' and m.user_id <> v_uid;
  return v_id;
end $$;

create function public.set_dues_plan_status(p_plan_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); v_cid uuid;
begin
  select community_id into v_cid from public.dues_plans where id = p_plan_id;
  if v_cid is null then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if not private.can('finance.manage', v_cid) then perform private.deny(); end if;
  if p_status not in ('active', 'archived') then raise exception 'invalid status' using errcode = '22023'; end if;
  perform private.require_mfa();
  update public.dues_plans set status = p_status where id = p_plan_id;
  perform private.audit('dues.plan_' || p_status, 'community', v_cid, 'dues_plan', p_plan_id, '{}'::jsonb);
end $$;

-- Member: "I've paid" notice for treasurer confirmation.
create function public.submit_dues_payment(p_plan_id uuid, p_amount_minor bigint, p_method text, p_reference text default null,
                                           p_period_label text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); p public.dues_plans; v_id uuid;
begin
  select * into p from public.dues_plans where id = p_plan_id and status = 'active';
  if p.id is null then raise exception 'dues plan not found' using errcode = 'P0002'; end if;
  if not private.is_member(p.community_id) then perform private.deny(); end if;
  if (select count(*) from public.dues_payments where user_id = v_uid and status = 'pending') >= 5 then
    raise exception 'you have too many payments awaiting confirmation' using errcode = 'P0001';
  end if;
  insert into public.dues_payments (plan_id, community_id, user_id, amount_minor, currency, period_label, method, reference, note, status, submitted_by)
  values (p.id, p.community_id, v_uid, p_amount_minor, p.currency, nullif(trim(p_period_label), ''), p_method,
          nullif(trim(p_reference), ''), nullif(trim(p_note), ''), 'pending', v_uid)
  returning id into v_id;
  perform private.audit('dues.payment_submitted', 'community', p.community_id, 'dues_payment', v_id,
    jsonb_build_object('plan', p.name, 'amount_minor', p_amount_minor, 'currency', p.currency));
  perform private.notify_holders('finance.manage', 'community', p.community_id, 'dues.payment_submitted',
    'Dues payment to confirm', p.name || ' · reference ' || coalesce(nullif(trim(p_reference), ''), '—'), '/admin/dues', array[v_uid]);
  return v_id;
end $$;

-- Treasurer: record a payment received directly (e.g. cash at a reunion). Confirmed immediately, never for oneself.
create function public.record_dues_payment(p_plan_id uuid, p_user_id uuid, p_amount_minor bigint, p_method text,
                                           p_reference text default null, p_period_label text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); p public.dues_plans; v_id uuid;
begin
  select * into p from public.dues_plans where id = p_plan_id;
  if p.id is null then raise exception 'dues plan not found' using errcode = 'P0002'; end if;
  if not private.can('finance.manage', p.community_id) then perform private.deny(); end if;
  if p_user_id = v_uid then perform private.deny('another finance officer must record your own payment'); end if;
  perform private.require_mfa();
  if not exists (select 1 from public.memberships where community_id = p.community_id and user_id = p_user_id and status = 'active') then
    raise exception 'payer is not a verified member of this community' using errcode = 'P0001';
  end if;
  insert into public.dues_payments (plan_id, community_id, user_id, amount_minor, currency, period_label, method, reference, note,
                                    status, submitted_by, decided_by, decided_at)
  values (p.id, p.community_id, p_user_id, p_amount_minor, p.currency, nullif(trim(p_period_label), ''), p_method,
          nullif(trim(p_reference), ''), nullif(trim(p_note), ''), 'confirmed', v_uid, v_uid, now())
  returning id into v_id;
  perform private.audit('dues.payment_recorded', 'community', p.community_id, 'dues_payment', v_id,
    jsonb_build_object('payer', p_user_id, 'amount_minor', p_amount_minor, 'currency', p.currency, 'method', p_method));
  perform private.notify(p_user_id, p.community_id, 'dues.payment_confirmed', 'Dues payment recorded', p.name, '/app/dues');
  return v_id;
end $$;

create function public.decide_dues_payment(p_payment_id uuid, p_confirm boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); d public.dues_payments; v_plan text;
begin
  select * into d from public.dues_payments where id = p_payment_id for update;
  if d.id is null then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if not private.can('finance.manage', d.community_id) then perform private.deny(); end if;
  if d.user_id = v_uid then perform private.deny('another finance officer must confirm your own payment'); end if;
  if d.status <> 'pending' then raise exception 'payment already %', d.status using errcode = 'P0001'; end if;
  perform private.require_mfa();
  update public.dues_payments set status = case when p_confirm then 'confirmed' else 'rejected' end,
    decided_by = v_uid, decided_at = now(), decision_note = nullif(trim(p_note), '') where id = d.id;
  select name into v_plan from public.dues_plans where id = d.plan_id;
  perform private.audit(case when p_confirm then 'dues.payment_confirmed' else 'dues.payment_rejected' end, 'community', d.community_id,
    'dues_payment', d.id, jsonb_build_object('payer', d.user_id, 'amount_minor', d.amount_minor, 'currency', d.currency, 'note', p_note));
  perform private.notify(d.user_id, d.community_id, case when p_confirm then 'dues.payment_confirmed' else 'dues.payment_rejected' end,
    case when p_confirm then 'Dues payment confirmed' else 'Dues payment not confirmed' end,
    v_plan || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/app/dues');
end $$;

create function public.void_dues_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); d public.dues_payments;
begin
  select * into d from public.dues_payments where id = p_payment_id for update;
  if d.id is null then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if not private.can('finance.manage', d.community_id) then perform private.deny(); end if;
  if d.status <> 'confirmed' then raise exception 'only confirmed payments can be voided' using errcode = 'P0001'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'a reason is required' using errcode = '22023'; end if;
  perform private.require_mfa();
  update public.dues_payments set status = 'voided', decision_note = trim(p_reason), decided_by = v_uid, decided_at = now()
   where id = d.id and d.user_id <> v_uid;
  if not found then perform private.deny('another finance officer must void your own payment'); end if;
  perform private.audit('dues.payment_voided', 'community', d.community_id, 'dues_payment', d.id,
    jsonb_build_object('payer', d.user_id, 'amount_minor', d.amount_minor, 'reason', p_reason));
end $$;

-- Real totals per plan (BR-8).
create function public.dues_summary(p_community_id uuid)
returns table (plan_id uuid, name text, amount_minor bigint, currency text, period text, due_date date, status text,
               confirmed_total bigint, paid_members bigint, pending_count bigint, active_members bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.can('finance.view', p_community_id) then perform private.deny(); end if;
  return query
  select p.id, p.name, p.amount_minor, p.currency, p.period, p.due_date, p.status,
    coalesce((select sum(d.amount_minor) from public.dues_payments d where d.plan_id = p.id and d.status = 'confirmed'), 0)::bigint,
    (select count(distinct d.user_id) from public.dues_payments d where d.plan_id = p.id and d.status = 'confirmed'),
    (select count(*) from public.dues_payments d where d.plan_id = p.id and d.status = 'pending'),
    (select count(*) from public.memberships m where m.community_id = p_community_id and m.status = 'active')
  from public.dues_plans p where p.community_id = p_community_id
  order by p.status, p.created_at desc;
end $$;

create function public.dues_payments_admin(p_community_id uuid, p_status text default null)
returns table (id uuid, plan_name text, payer_id uuid, payer_name text, amount_minor bigint, currency text, period_label text,
               method text, reference text, note text, status text, created_at timestamptz, decided_at timestamptz, decision_note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.can('finance.view', p_community_id) then perform private.deny(); end if;
  return query
  select d.id, p.name, d.user_id, pr.full_name, d.amount_minor, d.currency, d.period_label, d.method, d.reference, d.note,
         d.status, d.created_at, d.decided_at, d.decision_note
  from public.dues_payments d join public.dues_plans p on p.id = d.plan_id left join public.profiles pr on pr.id = d.user_id
  where d.community_id = p_community_id and (p_status is null or d.status = p_status)
  order by (d.status = 'pending') desc, d.created_at desc
  limit 500;
end $$;

---------------------------------------------------------------------------
-- Function privileges
---------------------------------------------------------------------------
revoke execute on function
  public.update_institution_branding(uuid, text, text, text, text, text, text, boolean),
  public.create_dues_plan(uuid, text, bigint, text, text, date, text, text, text),
  public.set_dues_plan_status(uuid, text),
  public.submit_dues_payment(uuid, bigint, text, text, text, text),
  public.record_dues_payment(uuid, uuid, bigint, text, text, text, text),
  public.decide_dues_payment(uuid, boolean, text),
  public.void_dues_payment(uuid, text),
  public.dues_summary(uuid),
  public.dues_payments_admin(uuid, text)
from public, anon;
grant execute on function
  public.update_institution_branding(uuid, text, text, text, text, text, text, boolean),
  public.create_dues_plan(uuid, text, bigint, text, text, date, text, text, text),
  public.set_dues_plan_status(uuid, text),
  public.submit_dues_payment(uuid, bigint, text, text, text, text),
  public.record_dues_payment(uuid, uuid, bigint, text, text, text, text),
  public.decide_dues_payment(uuid, boolean, text),
  public.void_dues_payment(uuid, text),
  public.dues_summary(uuid),
  public.dues_payments_admin(uuid, text)
to authenticated;
revoke execute on function private.is_institution_alumnus(uuid), private.institution_public(uuid), private.audit_institution_content() from public;
grant execute on function private.is_institution_alumnus(uuid), private.institution_public(uuid) to anon, authenticated, service_role;
