-- FR-3 / FR-6 / BR-6: per-field visibility and opt-in location.
do $$
declare
  v_c uuid := tests.community('Privacy C'); v_d uuid := tests.community('Privacy D');
  v_owner uuid := tests.user('owner@t.io', 'Olivia Owner');
  v_mate uuid := tests.user('mate@t.io', 'Max Mate');
  v_friend uuid := tests.user('friend@t.io', 'Fay Friend');
  v_stranger uuid := tests.user('stranger@t.io', 'Stan Stranger');
  v_p jsonb; v_conn uuid;
begin
  perform tests.member(v_c, v_owner); perform tests.member(v_c, v_mate);
  perform tests.member(v_d, v_owner); perform tests.member(v_d, v_friend);

  perform tests.login(v_owner);
  update public.profiles set headline = 'CFO', profession = 'Accountant', contact_email = 'olivia@private.io', phone = '+1 555',
    employer = 'Acme', visibility = visibility || '{"employer":"connections","headline":"everyone"}'::jsonb;
  perform tests.throws($q$update public.profiles set visibility = '{"phone":"public"}'$q$, 'invalid visibility values rejected', '23514');
  perform tests.throws($q$update public.locations set share_level = 'city', country = 'Ghana', city = 'Accra'$q$, 'location sharing requires consent', '23514');
  perform tests.logout();

  perform tests.login(v_mate);
  v_p := public.get_member_profile(v_owner);
  perform tests.ok(v_p ->> 'headline' = 'CFO', 'classmate sees members-level field');
  perform tests.ok(not (v_p ? 'contact_email') and not (v_p ? 'phone'), 'sensitive fields private by default');
  perform tests.ok(not (v_p ? 'employer'), 'connections-only field hidden from non-connection');
  perform tests.ok(v_p ->> 'country' is null, 'location hidden by default');
  perform tests.ok((select count(*) from public.community_directory(v_c, p_search => 'Acme')) = 0, 'cannot infer hidden employer by searching');
  perform tests.ok((select count(*) from public.community_directory(v_c, p_country => 'Ghana')) = 0, 'cannot infer hidden location by filtering');
  perform tests.ok((select count(*) from public.profiles) = 1, 'base profile table remains self-only');
  perform tests.ok((select count(*) from public.locations) = 1, 'base locations table remains self-only');
  perform tests.logout();

  perform tests.login(v_stranger);
  perform tests.throws(format('select public.get_member_profile(%L)', v_owner), 'stranger cannot open profile', '42501');
  perform tests.throws(format('insert into public.connections (addressee_id) values (%L)', v_owner), 'cannot connect with non-classmates', '42501');
  perform tests.logout();

  -- Connection unlocks connections-level fields
  perform tests.login(v_friend);
  insert into public.connections (addressee_id) values (v_owner) returning id into v_conn;
  perform tests.ok(not (public.get_member_profile(v_owner) ? 'employer'), 'pending connection unlocks nothing');
  perform tests.logout();
  perform tests.login(v_owner);
  update public.connections set status = 'accepted', responded_at = now() where id = v_conn;
  update public.locations set share_level = 'country', country = 'Ghana', city = 'Accra', consent_at = now();
  perform tests.logout();
  perform tests.login(v_friend);
  v_p := public.get_member_profile(v_owner);
  perform tests.ok(v_p ->> 'employer' = 'Acme', 'accepted connection sees connections-level field');
  perform tests.ok(v_p ->> 'country' = 'Ghana' and v_p ->> 'city' is null, 'country-level sharing hides city');
  perform tests.ok(not (v_p ? 'contact_email'), 'private stays private even for connections');
  perform tests.ok((select count(*) from public.community_locations(v_d)) = 1, 'opted-in member appears in locations list');
  perform tests.logout();

  perform tests.login(v_owner);
  update public.profiles set directory_listed = false;
  perform tests.logout();
  perform tests.login(v_mate);
  perform tests.ok((select count(*) from public.community_directory(v_c)) = 1, 'unlisted members are excluded from the directory');
  perform tests.logout();
end $$;
