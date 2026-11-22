-- Lookup ranking: after prefix/substring/word matches, prefer names closest overall (penalises extra words),
-- so "univ of nig" ranks "University of Nigeria, Nsukka" above "ABTI American University of Nigeria".
create or replace function public.search_institution_directory(p_query text, p_country text default null, p_limit int default 10)
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
           round(extensions.word_similarity(q.t, d.name)::numeric, 2) desc,
           extensions.similarity(q.t, d.name) desc,
           char_length(d.name),
           d.name
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
$$;
