-- Institution branding/network and membership dues.
do $$
declare
  v_i uuid := tests.institution('Branding University'); v_j uuid := tests.institution('Other Institute');
  v_c uuid := tests.community('Acc 07', 'active', v_i); v_d uuid := tests.community('Law 09', 'active', v_j);
  v_ia uuid := tests.user('ia8@t.io', 'Inst Admin'); v_ca uuid := tests.user('ca8@t.io', 'Class Admin');
  v_tr uuid := tests.user('tr8@t.io', 'Treasurer'); v_m uuid := tests.user('m8@t.io', 'Member');
  v_out uuid := tests.user('out8@t.io', 'Outsider'); v_plan uuid; v_pay uuid; v_pay2 uuid; v_tpay uuid;
begin
  perform tests.role(v_ia, 'institution_admin', 'institution', v_i);
  perform tests.member(v_c, v_ca); perform tests.role(v_ca, 'class_admin', 'community', v_c);
  perform tests.member(v_c, v_tr); perform tests.role(v_tr, 'class_treasurer', 'community', v_c);
  perform tests.member(v_c, v_m); perform tests.member(v_d, v_out);

  -- Branding: institution admin only, own institution only; contrast-unsafe values rejected by format checks
  perform tests.login(v_ia, 'aal1');
  perform public.update_institution_branding(v_i, 'Excellence since 1962', 'About us', '#0b3d91', '#f5b700', 'wordmark', v_i || '/logo.png');
  perform tests.throws(format('select public.update_institution_branding(%L, %L)', v_j, 'x'), 'institution admin cannot brand another institution', '42501');
  perform tests.throws(format('select public.update_institution_branding(%L, null, null, %L)', v_i, 'red'), 'colours must be hex', '23514');
  perform tests.throws(format('select public.update_institution_branding(%L, null, null, null, null, %L, %L)', v_i, 'mark', v_j || '/x.png'),
    'logo path must belong to the institution', '22023');
  perform tests.throws(format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)', 'institution-assets', v_j || '/a.png', v_ia),
    'cannot upload assets for another institution', '42501');
  insert into public.institution_posts (institution_id, kind, audience, title, body) values
    (v_i, 'news', 'public', 'Open day', 'Everyone welcome'),
    (v_i, 'opportunity', 'alumni', 'Graduate trainee roles', 'Alumni only');
  insert into public.institution_links (institution_id, kind, name, url) values (v_i, 'association', 'Alumni Association', 'https://example.org');
  perform tests.logout();
  perform tests.ok((select brand_primary from public.institutions where id = v_i) = '#0B3D91', 'branding saved (normalised)');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'institution.branding_updated'), 'branding change audited');
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'institution_post.insert' and scope_id = v_i), 'post creation audited');

  perform tests.login(v_ca);
  perform tests.throws(format('select public.update_institution_branding(%L, %L)', v_i, 'x'), 'class admins cannot brand the institution', '42501');
  perform tests.throws(format('insert into public.institution_posts (institution_id, kind, title, body) values (%L, %L, %L, %L)', v_i, 'news', 'Hi', 'x'),
    'class admins cannot post as the institution', '42501');
  perform tests.logout();

  perform tests.anon();
  perform tests.ok((select tagline from public.institutions where id = v_i) = 'Excellence since 1962', 'anon reads public branding');
  perform tests.ok((select count(*) from public.institution_posts where institution_id = v_i) = 1, 'anon sees only public posts');
  perform tests.ok((select count(*) from public.institution_links where institution_id = v_i) = 1, 'linkages are public');
  perform tests.logout();
  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.institution_posts where institution_id = v_i) = 2, 'alumni see alumni-only posts');
  perform tests.logout();
  perform tests.login(v_out);
  perform tests.ok((select count(*) from public.institution_posts where institution_id = v_i) = 1, 'alumni of other institutions see only public posts');
  perform tests.logout();

  -- Dues: treasurer creates (MFA), member submits, independent confirmation, SoD, isolation
  perform tests.login(v_tr, 'aal1');
  perform tests.throws(format('select public.create_dues_plan(%L, %L, 2500000, %L, %L)', v_c, 'Annual dues', 'NGN', 'annual'),
    'dues plan creation needs MFA', '42501');
  perform tests.logout();
  perform tests.login(v_tr);
  v_plan := public.create_dues_plan(v_c, 'Annual dues 2027', 2500000, 'ngn', 'annual', '2027-03-31', 'Supports reunion and welfare',
    'Bank transfer to the class account', 'https://paystack.com/pay/example');
  perform tests.logout();
  perform tests.ok((select currency from public.dues_plans where id = v_plan) = 'NGN', 'currency normalised');
  perform tests.ok((select count(*) from public.notifications where kind = 'dues.plan_created') = 2, 'other members notified of new dues (not the creator)');

  perform tests.login(v_ca);
  perform tests.throws(format('select public.create_dues_plan(%L, %L, 100, %L, %L)', v_c, 'Rogue', 'NGN', 'annual'),
    'class admin cannot create dues (separation of duties)', '42501');
  perform tests.ok((select count(*) from public.dues_summary(v_c)) = 1, 'class admin can view dues totals');
  perform tests.logout();

  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.dues_plans) = 1, 'members see active plans of their class');
  v_pay := public.submit_dues_payment(v_plan, 2500000, 'bank_transfer', 'TRF-123', '2027');
  perform tests.throws(format('select public.decide_dues_payment(%L, true)', v_pay), 'members cannot confirm payments', '42501');
  perform tests.throws(format('select * from public.dues_summary(%L)', v_c), 'members cannot view class totals', '42501');
  perform tests.throws($q$update public.dues_payments set status = 'confirmed'$q$, 'payments are not client-writable', '42501');
  perform tests.logout();

  perform tests.login(v_tr);
  perform public.decide_dues_payment(v_pay, true, 'Received');
  perform tests.throws(format('select public.decide_dues_payment(%L, true)', v_pay), 'cannot decide twice', 'P0001');
  perform tests.throws(format('select public.record_dues_payment(%L, %L, 100, %L)', v_plan, v_tr, 'cash'), 'treasurer cannot record own payment', '42501');
  v_pay2 := public.record_dues_payment(v_plan, v_ca, 2500000, 'cash', null, '2027', 'Paid at reunion');
  v_tpay := public.submit_dues_payment(v_plan, 2500000, 'card', 'CARD-9');
  perform tests.throws(format('select public.decide_dues_payment(%L, true)', v_tpay), 'treasurer cannot confirm own payment', '42501');
  perform tests.ok((select confirmed_total from public.dues_summary(v_c)) = 5000000, 'totals reflect confirmed payments only');
  perform tests.ok((select paid_members from public.dues_summary(v_c)) = 2 and (select pending_count from public.dues_summary(v_c)) = 1, 'paid/pending counts are real');
  perform public.void_dues_payment(v_pay2, 'Duplicate entry');
  perform tests.ok((select confirmed_total from public.dues_summary(v_c)) = 2500000, 'voided payments leave the totals');
  perform tests.logout();
  perform tests.ok(exists (select 1 from public.audit_logs where action = 'dues.payment_voided'), 'void audited');

  perform tests.login(v_out);
  perform tests.ok((select count(*) from public.dues_plans) = 0 and (select count(*) from public.dues_payments) = 0, 'other classes see no dues data');
  perform tests.throws(format('select public.submit_dues_payment(%L, 1, %L)', v_plan, 'cash'), 'outsiders cannot submit to another class', '42501');
  perform tests.logout();
  perform tests.login(v_m);
  perform tests.ok((select count(*) from public.dues_payments) = 1, 'members see only their own payments');
  perform tests.logout();
end $$;
