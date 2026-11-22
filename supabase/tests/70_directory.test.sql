-- Institution directory lookup (reference catalogue, separate from verified institutions).
insert into public.institution_directory (name, country, country_code, state_province, website_url, kind, source) values
  ('University of Lagos', 'Nigeria', 'NG', 'Lagos', null, 'university', 'curated'),
  ('Lagos State University', 'Nigeria', 'NG', null, 'http://www.lasu.edu.ng/', 'university', 'hipo'),
  ('Yaba College of Technology', 'Nigeria', 'NG', null, 'https://yabatech.edu.ng/', 'college', 'hipo'),
  ('Federal Polytechnic Nekede', 'Nigeria', 'NG', 'Imo', null, 'polytechnic', 'curated'),
  ('University of Ghana', 'Ghana', 'GH', null, 'https://www.ug.edu.gh/', 'university', 'hipo'),
  ('University of Toronto', 'Canada', 'CA', 'Ontario', 'https://www.utoronto.ca/', 'university', 'hipo');

do $$
declare v_pa uuid := tests.user('pa7@t.io', 'Plat Admin'); v_u uuid := tests.user('u7@t.io', 'Una'); v_req uuid; v_inst uuid; v_dir bigint;
begin
  perform tests.role(v_pa, 'platform_admin', 'platform');
  select id into v_dir from public.institution_directory where name = 'University of Lagos';

  perform tests.anon();
  perform tests.ok((select name from public.search_institution_directory('univ of lag') limit 1) = 'University of Lagos', 'fuzzy lookup finds University of Lagos');
  perform tests.ok((select name from public.search_institution_directory('lagos') limit 1) = 'Lagos State University', 'prefix matches rank first');
  perform tests.ok((select count(*) from public.search_institution_directory('university', 'Nigeria')) = 2, 'country filter narrows results');
  perform tests.ok((select count(*) from public.search_institution_directory('u')) = 0, 'queries need at least 2 characters');
  perform tests.ok((select count(*) from public.search_institution_directory('%')) = 0, 'LIKE wildcards are literal');
  perform tests.ok((select count(*) from public.search_institution_directory('a', null, 1000)) <= 25, 'result size is capped');
  perform tests.ok((select institutions from public.institution_directory_countries() where country = 'Nigeria') = 4, 'country list carries real counts');
  perform tests.throws($q$insert into public.institution_directory (name, country, source) values ('Fake U', 'Nowhere', 'curated')$q$, 'anon cannot write the directory', '42501');
  perform tests.ok((select count(*) from public.institutions) = 0, 'directory entries are not verified institutions');
  perform tests.logout();

  perform tests.login(v_u);
  perform tests.throws($q$update public.institution_directory set name = 'Hacked'$q$, 'members cannot edit the directory', '42501');
  v_req := public.request_community('univ lagos typo', 'Accounting', 2007, null, v_dir);
  perform tests.ok((select institution_name from public.community_requests where id = v_req) = 'University of Lagos', 'request uses the official directory name');
  perform tests.logout();

  perform tests.login(v_pa);
  v_inst := public.create_institution('ignored', null, 'Akoka', null, true, v_dir);
  perform tests.ok((select name = 'University of Lagos' and country = 'Nigeria' and directory_id = v_dir and status = 'verified'
                    from public.institutions where id = v_inst), 'institution created from directory entry keeps the link');
  perform tests.logout();
  perform tests.login(v_u);
  perform tests.throws(format('select public.create_institution(%L)', 'Rogue U'), 'members cannot create institutions', '42501');
  perform tests.logout();
end $$;

do $$
begin
  insert into public.institution_directory (name, country, kind, source) values
    ('ABTI American University of Nigeria', 'Nigeria', 'university', 'hipo'),
    ('University of Nigeria, Nsukka', 'Nigeria', 'university', 'curated');
  perform tests.ok((select name from public.search_institution_directory('univ of nig') limit 1) = 'University of Nigeria, Nsukka',
    'closest overall name ranks first');
end $$;

do $$
begin
  insert into public.institution_directory (name, country, kind, source) values
    ('Higher School of University and Advanced Studies Pisa', 'Italy', 'university', 'hipo'),
    ('Chengdu College of University of Electronic Science and Technology of China', 'China', 'university', 'hipo'),
    ('Kwara State Polytechnic', 'Nigeria', 'polytechnic', 'hipo'),
    ('Mara Poly-Tech College', 'Malaysia', 'college', 'hipo');
  perform tests.ok((select name from public.search_institution_directory('univ of nig') limit 1) = 'University of Nigeria, Nsukka',
    'word-prefix matches beat long names sharing "University of" (no country filter)');
  perform tests.ok((select name from public.search_institution_directory('kwara poly') limit 1) = 'Kwara State Polytechnic', 'abbreviated multi-word query');
  perform tests.ok((select count(*) from public.search_institution_directory('a(b[c')) >= 0, 'regex metacharacters in input are safe');
  perform tests.ok((select count(*) from public.search_institution_directory('.*')) = 0, 'regex wildcards are literal');
end $$;
