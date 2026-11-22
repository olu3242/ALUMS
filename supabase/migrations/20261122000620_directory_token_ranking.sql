-- Lookup ranking v3. Rank by how many typed words start a word in the name ("univ of nig" → all three match
-- "University of Nigeria, Nsukka"), then by a blend of trigram scores, then shorter names. Typed text is regex-escaped.
create or replace function public.search_institution_directory(p_query text, p_country text default null, p_limit int default 10)
returns table (id bigint, name text, country text, country_code text, state_province text, website_url text, kind text)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select nullif(trim(p_query), '') as t, nullif(trim(p_country), '') as c
  ), toks as (
    select coalesce(array_agg(regexp_replace(w, '([\\.^$*+?()\[\]{}|-])', '\\\1', 'g')), '{}') as a, count(*) as n
    from q, regexp_split_to_table(lower(coalesce(q.t, '')), '[\s,]+') w where w <> ''
  ), scored as (
    select d.*,
      (select count(*) from unnest(toks.a) tok where d.name ~* ('\m' || tok)) as hits,
      toks.n as n,
      extensions.word_similarity(q.t, d.name) + extensions.strict_word_similarity(q.t, d.name) + extensions.similarity(q.t, d.name) as score,
      d.name ilike q.t || '%' as is_prefix
    from public.institution_directory d, q, toks
    where q.t is not null and char_length(q.t) >= 2
      and (q.c is null or d.country = q.c)
  )
  select s.id, s.name, s.country, s.country_code, s.state_province, s.website_url, s.kind
  from scored s, q
  where s.is_prefix or s.hits = s.n or s.name ilike private.like_pattern(q.t) or extensions.word_similarity(q.t, s.name) > 0.45
  order by s.is_prefix desc, (s.hits = s.n) desc, s.hits desc, s.score desc, char_length(s.name), s.name
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
$$;
