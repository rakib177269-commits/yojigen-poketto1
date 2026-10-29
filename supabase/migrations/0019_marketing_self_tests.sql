-- 0019 Self-tests for the Purchase reporting rules (phase 6). Always rolled back.

create function public.run_marketing_self_tests() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  results jsonb := '[]'::jsonb;
  u_admin uuid := gen_random_uuid();
  pid uuid;
  o_pending uuid;
  o_ok uuid;
  o_rejected uuid;
  claimed jsonb;
  again jsonb;
  v_err text;
begin
  begin
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'st-admin4@selftest.local', now(), 'authenticated', 'authenticated');
    insert into public.staff (user_id, email, role) values (u_admin, 'st-admin4@selftest.local', 'admin');
    insert into public.products (title, slug, price, stock, status) values ('Marketing Test Cup', 'marketing-test-cup', 300, 10, 'active')
      returning id into pid;
    o_pending := (private.create_order(jsonb_build_object('name', 'Pending Buyer', 'phone', '01711111111',
      'address', 'House 9, Road 9, Uttara, Dhaka', 'items', jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 1))), 'manual')->>'id')::uuid;
    o_ok := (private.create_order(jsonb_build_object('name', 'Good Buyer', 'phone', '01722222222',
      'address', 'House 9, Road 9, Uttara, Dhaka', 'items', jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 2))), 'manual')->>'id')::uuid;
    o_rejected := (private.create_order(jsonb_build_object('name', 'Fake Buyer', 'phone', '01733333333',
      'address', 'House 9, Road 9, Uttara, Dhaka', 'items', jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 1))), 'manual')->>'id')::uuid;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    perform public.admin_confirm_order(o_ok);
    perform public.admin_reject_order(o_rejected, 'self-test');

    -- only orders created in this test are considered (real ones may exist)
    claimed := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(public.marketing_claim_orders(array['meta', 'ga4'], 100)) x
                where (x->>'id')::uuid in (o_pending, o_ok, o_rejected));
    results := results || jsonb_build_object('name', 'only the confirmed order is picked up; pending and rejected never', 'pass',
      jsonb_array_length(claimed) = 1 and (claimed->0->>'id')::uuid = o_ok
      and (claimed->0->>'total')::int = (select total from public.orders where id = o_ok)
      and jsonb_array_length(claimed->0->'items') = 1);

    again := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(public.marketing_claim_orders(array['meta', 'ga4'], 100)) x
              where (x->>'id')::uuid = o_ok);
    results := results || jsonb_build_object('name', 'a claimed order is not picked up again by an overlapping run', 'pass', jsonb_array_length(again) = 0);

    perform public.marketing_finish_order(o_ok, '{"meta": {"ok": true}, "ga4": {"ok": false, "error": "HTTP 500"}}');
    results := results || jsonb_build_object('name', 'results recorded per vendor; failure keeps the error', 'pass',
      exists (select 1 from public.orders where id = o_ok and capi_sent_at is not null and not (marketing_sent ? 'ga4')
              and capi_claimed_at is null and capi_last_error like 'ga4: HTTP 500%'));

    claimed := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(public.marketing_claim_orders(array['meta'], 100)) x
                where (x->>'id')::uuid = o_ok);
    again := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(public.marketing_claim_orders(array['meta', 'ga4'], 100)) x
              where (x->>'id')::uuid = o_ok);
    results := results || jsonb_build_object('name', 'sent to Facebook: never again; Google retried', 'pass',
      jsonb_array_length(claimed) = 0 and jsonb_array_length(again) = 1 and (again->0->'sent'->>'meta') is not null);

    perform public.marketing_finish_order(o_ok, '{"ga4": {"ok": true}}');
    update public.orders set capi_attempts = 5 where id = o_pending;
    results := results || jsonb_build_object('name', 'fully reported order is done', 'pass',
      not exists (select 1 from jsonb_array_elements(public.marketing_claim_orders(array['meta', 'ga4'], 100)) x where (x->>'id')::uuid = o_ok)
      and exists (select 1 from public.orders where id = o_ok and capi_last_error is null));

    v_err := null;
    begin perform public.admin_update_tracking_settings('{"meta_pixel_id": "abc"}'); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'invalid Pixel ID refused', 'pass', v_err = 'invalid_meta_pixel');
    v_err := null;
    begin perform public.admin_update_tracking_settings('{"ga4_id": "UA-12345-1"}'); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'old Universal Analytics id refused (GA4 only)', 'pass', v_err = 'invalid_ga4_id');

    raise exception using errcode = 'YPRBK', message = 'self_test_rollback';
  exception when sqlstate 'YPRBK' then
    null;
  end;

  return jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(results) x where (x->>'pass')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not coalesce((x->>'pass')::boolean, false)),
    'results', results);
end $$;

grant execute on function public.run_marketing_self_tests() to service_role;
