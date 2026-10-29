-- 0021 Self-tests for customer messages and sign-in codes (phase 7). Always rolled back.

create function public.run_messages_self_tests() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  results jsonb := '[]'::jsonb;
  u_admin uuid := gen_random_uuid();
  pid uuid;
  o1 uuid;
  o2 uuid;
  r jsonb;
  claimed jsonb;
  v_code text;
  v_wrong text;
  i integer;
begin
  begin
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_admin, 'st-admin5@selftest.local', now(), 'authenticated', 'authenticated');
    insert into public.staff (user_id, email, role) values (u_admin, 'st-admin5@selftest.local', 'admin');
    insert into public.products (title, slug, price, stock, status) values ('Message Test Pen', 'message-test-pen', 200, 10, 'active')
      returning id into pid;
    -- known settings for this test: SMS on confirm only, email on everything, staff copy on
    update public.store_settings set integrations = jsonb_set(coalesce(integrations, '{}'::jsonb), '{notifications}',
      '{"sms": {"placed": false, "confirmed": true, "dispatched": false, "delivered": false, "cancelled": false},
        "email": {"placed": true, "confirmed": true, "dispatched": true, "delivered": true, "cancelled": true, "staff_new_order": true},
        "staff_email": "owner@selftest.local"}'::jsonb) where id = 1;

    o1 := (private.create_order(jsonb_build_object('name', 'Msg Buyer', 'phone', '01755555555', 'email', 'buyer@selftest.local',
      'address', 'House 3, Road 4, Banani, Dhaka', 'items', jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 1))), 'manual')->>'id')::uuid;
    results := results || jsonb_build_object('name', 'new order queues customer email + staff email, no SMS (switched off)', 'pass',
      (select count(*) from private.notifications where order_id = o1) = 2
      and exists (select 1 from private.notifications where order_id = o1 and kind = 'placed' and channel = 'email' and recipient = 'buyer@selftest.local')
      and exists (select 1 from private.notifications where order_id = o1 and kind = 'staff_new_order' and recipient = 'owner@selftest.local'));

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    perform public.admin_confirm_order(o1);
    results := results || jsonb_build_object('name', 'confirming queues the confirmation SMS and email', 'pass',
      exists (select 1 from private.notifications where order_id = o1 and kind = 'confirmed' and channel = 'sms' and recipient = '8801755555555')
      and exists (select 1 from private.notifications where order_id = o1 and kind = 'confirmed' and channel = 'email'));

    o2 := (private.create_order(jsonb_build_object('name', 'Fake Buyer', 'phone', '01766666666', 'email', 'fake@selftest.local',
      'address', 'House 3, Road 4, Banani, Dhaka', 'items', jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 1))), 'manual')->>'id')::uuid;
    perform public.admin_reject_order(o2, 'self-test');
    results := results || jsonb_build_object('name', 'a rejected (fake) order gets no cancellation message', 'pass',
      not exists (select 1 from private.notifications where order_id = o2 and kind = 'cancelled'));

    -- sending: claim, fail, retry, give up after 5 tries; claimed rows aren't handed out twice
    claimed := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(public.notify_claim(200, o1)) x);
    results := results || jsonb_build_object('name', 'claim returns the order details the templates need', 'pass',
      jsonb_array_length(claimed) = 4 and (claimed->0->'order'->>'code') is not null and (claimed->0->'order'->>'total') is not null
      and jsonb_array_length(claimed->0->'order'->'items') = 1
      and jsonb_array_length(public.notify_claim(200, o1)) = 0);
    perform public.notify_finish((claimed->0->>'id')::bigint, 'sent');
    perform public.notify_finish((claimed->1->>'id')::bigint, 'skipped', 'email not set up');
    perform public.notify_finish((claimed->2->>'id')::bigint, 'failed', 'HTTP 500');
    results := results || jsonb_build_object('name', 'sent / skipped are final; a failure is retried', 'pass',
      (select status from private.notifications where id = (claimed->0->>'id')::bigint) = 'sent'
      and (select status from private.notifications where id = (claimed->1->>'id')::bigint) = 'skipped'
      and (select status from private.notifications where id = (claimed->2->>'id')::bigint) = 'pending');
    update private.notifications set attempts = 5 where id = (claimed->2->>'id')::bigint;
    perform public.notify_finish((claimed->2->>'id')::bigint, 'failed', 'HTTP 500');
    results := results || jsonb_build_object('name', 'after 5 tries a message is marked failed (no endless retries)', 'pass',
      (select status from private.notifications where id = (claimed->2->>'id')::bigint) = 'failed');

    -- sign-in codes
    r := public.otp_request('০১৭৭৭৭৭৭৭৭৭', 'st-client-1');
    v_code := r->>'code';
    results := results || jsonb_build_object('name', 'code request: Bangla digits accepted, 6-digit code, only a hash stored', 'pass',
      (r->>'ok')::boolean and r->>'phone' = '8801777777777' and v_code ~ '^[0-9]{6}$'
      and not exists (select 1 from private.otp_codes where code_hash = v_code or code_hash like '%' || v_code || '%'));
    v_wrong := lpad(((v_code::int + 1) % 1000000)::text, 6, '0');
    r := public.otp_verify('01777777777', v_wrong, 'st-client-1');
    results := results || jsonb_build_object('name', 'wrong code refused', 'pass', r->>'error' = 'wrong_code');
    r := public.otp_verify('01777777777', v_code, 'st-client-1');
    results := results || jsonb_build_object('name', 'right code signs in and creates the customer', 'pass',
      (r->>'ok')::boolean and exists (select 1 from public.customers where id = (r->>'customer_id')::uuid and phone = '8801777777777'));
    r := public.otp_verify('01777777777', v_code, 'st-client-1');
    results := results || jsonb_build_object('name', 'a code works only once', 'pass', r->>'error' = 'code_expired');

    perform public.otp_request('01788888888', 'st-client-2');
    for i in 1..5 loop perform public.otp_verify('01788888888', '000000', 'st-client-2'); end loop;
    r := public.otp_verify('01788888888', '000000', 'st-client-2');
    results := results || jsonb_build_object('name', 'five wrong tries kill the code', 'pass', r->>'error' in ('too_many_attempts', 'code_expired'));

    perform public.otp_request('01799999999', 'st-client-3');
    perform public.otp_request('01799999999', 'st-client-3');
    perform public.otp_request('01799999999', 'st-client-3');
    r := public.otp_request('01799999999', 'st-client-3');
    results := results || jsonb_build_object('name', 'max 3 codes per number per 15 minutes', 'pass', r->>'error' = 'rate_limited');

    r := public.customer_account((select id from public.customers where phone = '8801766666666'));
    results := results || jsonb_build_object('name', 'account page never lists rejected orders', 'pass',
      jsonb_array_length(r->'orders') = 0);

    raise exception using errcode = 'YPRBK', message = 'self_test_rollback';
  exception when sqlstate 'YPRBK' then
    null;
  end;

  return jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(results) x where (x->>'pass')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not coalesce((x->>'pass')::boolean, false)),
    'results', results);
end $$;

grant execute on function public.run_messages_self_tests() to service_role;
