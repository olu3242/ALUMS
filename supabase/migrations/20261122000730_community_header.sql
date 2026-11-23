-- Class dashboard header: tagline + cover photo, editable by holders of community.manage
-- (class admins of that class, plus institution/platform admins through scope inheritance).
alter table public.class_communities
  add column header_tagline text check (char_length(header_tagline) <= 160),
  add column header_cover_path text check (header_cover_path is null
    or header_cover_path ~ '^[0-9a-f-]{36}/header/[A-Za-z0-9._-]{1,120}$');
-- authenticated already has table-level SELECT; anon keeps its column list, so the cover path never leaves members.

create function public.update_community_header(p_community_id uuid, p_tagline text default null,
                                               p_cover_path text default null, p_remove_cover boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_auth(); c public.class_communities;
begin
  select * into c from public.class_communities where id = p_community_id for update;
  if c.id is null then raise exception 'community not found' using errcode = 'P0002'; end if;
  if not private.can('community.manage', c.id) then perform private.deny(); end if;
  if p_cover_path is not null then
    if split_part(p_cover_path, '/', 1) <> c.id::text or split_part(p_cover_path, '/', 2) <> 'header' then
      raise exception 'cover image must belong to this community' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'community-media' and o.name = p_cover_path) then
      raise exception 'cover image not found' using errcode = 'P0002';
    end if;
  end if;
  update public.class_communities set
    header_tagline = nullif(trim(p_tagline), ''),
    header_cover_path = case when p_remove_cover then null else coalesce(p_cover_path, header_cover_path) end,
    updated_at = now()
  where id = c.id;
  perform private.audit('community.header_updated', 'community', c.id, 'community', c.id, jsonb_build_object(
    'tagline_changed', nullif(trim(p_tagline), '') is distinct from c.header_tagline,
    'cover', case when p_remove_cover then 'removed' when p_cover_path is not null then 'replaced' else 'unchanged' end));
end $$;
revoke all on function public.update_community_header(uuid, text, text, boolean) from public;
grant execute on function public.update_community_header(uuid, text, text, boolean) to authenticated;
