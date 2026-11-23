-- Admin list view of class modules: real counts and last activity per module (aggregates only, no member PII),
-- plus who last switched it. Readable by anyone who can open this class's admin center.
create function public.admin_feature_summary(p_community_id uuid)
returns table (feature text, items bigint, detail text, last_activity timestamptz,
               enabled boolean, locked boolean, switched_at timestamptz, switched_by text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v_inst uuid;
begin
  perform private.require_auth();
  if not private.can('community.view_admin', p_community_id) then perform private.deny(); end if;
  select institution_id into v_inst from public.class_communities where id = p_community_id;
  return query
  with s as (
    select 'alumni'::text f, (select count(*) from public.memberships where community_id = p_community_id and status = 'active') n,
      (select count(*) || ' pending request(s)' from public.membership_requests where community_id = p_community_id and status = 'pending') d,
      greatest((select max(updated_at) from public.memberships where community_id = p_community_id),
               (select max(created_at) from public.membership_requests where community_id = p_community_id)) t
    union all select 'businesses', (select count(*) from public.businesses where community_id = p_community_id and status <> 'draft'),
      (select count(*) filter (where status = 'approved') || ' approved · ' || count(*) filter (where status = 'submitted') || ' awaiting review'
         from public.businesses where community_id = p_community_id),
      (select max(updated_at) from public.businesses where community_id = p_community_id)
    union all select 'locations', (select count(*) from public.memberships m join public.locations l on l.user_id = m.user_id
                                   where m.community_id = p_community_id and m.status = 'active' and l.share_level <> 'hidden'),
      'members sharing a location (opt-in)',
      (select max(l.updated_at) from public.memberships m join public.locations l on l.user_id = m.user_id
       where m.community_id = p_community_id and m.status = 'active' and l.share_level <> 'hidden')
    union all select 'events', (select count(*) from public.events where community_id = p_community_id),
      (select count(*) filter (where status = 'published' and starts_at > now()) || ' upcoming · ' || count(*) filter (where status = 'draft') || ' draft'
         from public.events where community_id = p_community_id),
      (select max(updated_at) from public.events where community_id = p_community_id)
    union all select 'gallery', (select count(*) from public.media_assets where community_id = p_community_id),
      (select count(*) || ' album(s)' from public.albums where community_id = p_community_id),
      greatest((select max(created_at) from public.media_assets where community_id = p_community_id),
               (select max(created_at) from public.albums where community_id = p_community_id))
    union all select 'announcements', (select count(*) from public.announcements where community_id = p_community_id),
      (select count(*) filter (where is_pinned) || ' pinned' from public.announcements where community_id = p_community_id),
      (select max(updated_at) from public.announcements where community_id = p_community_id)
    union all select 'dues', (select count(*) from public.dues_plans where community_id = p_community_id and status = 'active'),
      (select count(*) filter (where status = 'pending') || ' payment(s) to confirm' from public.dues_payments where community_id = p_community_id),
      greatest((select max(updated_at) from public.dues_plans where community_id = p_community_id),
               (select max(created_at) from public.dues_payments where community_id = p_community_id))
    union all select 'network',
      case when v_inst is null then 0 else (select count(*) from public.institution_posts where institution_id = v_inst and status = 'published') end,
      case when v_inst is null then 'No institution linked' else
        (select count(*) || ' linkage(s)' from public.institution_links where institution_id = v_inst) end,
      case when v_inst is null then null else (select max(published_at) from public.institution_posts where institution_id = v_inst) end
  )
  select s.f, s.n, s.d, s.t, coalesce(cf.enabled, true), coalesce(cf.locked, false), cf.updated_at, p.full_name
  from s left join public.community_features cf on cf.community_id = p_community_id and cf.feature = s.f
  left join public.profiles p on p.id = cf.updated_by;
end $$;
revoke all on function public.admin_feature_summary(uuid) from public;
grant execute on function public.admin_feature_summary(uuid) to authenticated;
