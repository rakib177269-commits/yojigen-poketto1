-- 0017 Self-tests for the Pathao courier flow (phase 5). Always rolled back.

create function public.run_courier_self_tests() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  results jsonb := '[]'::jsonb;
  u_packer uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  pid uuid;
  o1 uuid;
  o2 uuid;
  c jsonb;
  r jsonb;
  v_err text;
begin
  begin
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_packer, 'st-packer3@selftest.local', now(), 'authenticated', 'authenticated'),
      (u_admin, 'st-admin3@selftest.local', now(), 'authenticated', 'authenticated');
    insert into public.staff (user_id, email, role) values
      (u_packer, 'st-packer3@selftest.local', 'packer'), (u_admin, 'st-admin3@selftest.local', 'admin');
    insert into public.products (title, slug, price, stock, status) values ('Courier Test Mug', 'courier-test-mug', 400, 10, 'active')
      returning id into pid;
    o1 := (private.create_order(jsonb_build_object('name', 'Test Buyer', 'phone', '01712345678',
      'address', 'House 1, Road 2, Mirpur, Dhaka', 'items', jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 2))), 'manual')->>'id')::uuid;
    o2 := (private.create_order(jsonb_build_object('name', 'Test Buyer Two', 'phone', '01812345678',
      'address', 'Village Road, Sylhet', 'items', jsonb_build_array(jsonb_build_object('product_id', pid, 'quantity', 1))), 'manual')->>'id')::uuid;

    -- packer can't change courier settings; admin can, and bad values are refused
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_packer, 'role', 'authenticated')::text, true);
    v_err := null;
    begin perform public.admin_update_courier_settings('{"store_id": "123"}'); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'packer cannot change Pathao settings', 'pass', v_err = 'not_allowed');

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    update public.store_settings set integrations = coalesce(integrations, '{}'::jsonb) - 'pathao' where id = 1;
    perform public.admin_confirm_order(o1);
    v_err := null;
    begin perform public.admin_courier_claim(o1); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'booking refused until a Pathao store is set', 'pass', v_err = 'courier_not_configured');

    v_err := null;
    begin perform public.admin_update_courier_settings('{"store_id": "12", "default_weight": "25"}'); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'parcel weight over 10 kg refused', 'pass', v_err = 'invalid_weight');
    perform public.admin_update_courier_settings('{"store_id": "12345", "default_weight": "0.5"}');

    v_err := null;
    begin perform public.admin_courier_claim(o2); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'pending (unconfirmed) order cannot be booked', 'pass', v_err = 'not_confirmed');

    -- packer books a confirmed order; a second click while booking is refused
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_packer, 'role', 'authenticated')::text, true);
    c := public.admin_courier_claim(o1);
    results := results || jsonb_build_object('name', 'claim returns Pathao fields (local phone, COD amount, store)', 'pass',
      c->>'phone' = '01712345678' and (c->>'amount_to_collect')::int = (select total from public.orders where id = o1)
      and (c->>'store_id')::int = 12345 and (c->>'quantity')::int = 2 and c->>'description' like '2× Courier Test Mug%');
    v_err := null;
    begin perform public.admin_courier_claim(o1); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'double click while booking is refused', 'pass', v_err = 'booking_in_progress');

    perform public.admin_courier_release(o1, 'Pathao said: invalid address');
    c := public.admin_courier_claim(o1);
    perform public.admin_courier_booked(o1, 'DT291025ABCD', 60, 'Pending');
    results := results || jsonb_build_object('name', 'failed attempt can be retried; booking marks the order dispatched', 'pass',
      exists (select 1 from public.orders where id = o1 and status = 'dispatched' and courier_consignment_id = 'DT291025ABCD'
              and courier_fee = 60 and courier_lock_at is null)
      and exists (select 1 from public.order_events where order_id = o1 and label = 'Pathao booking failed' and not is_public));
    v_err := null;
    begin perform public.admin_courier_claim(o1); exception when others then v_err := sqlerrm; end;
    results := results || jsonb_build_object('name', 'an order cannot be booked twice', 'pass', v_err = 'already_booked');

    -- webhook: progress is shown to the customer, duplicates ignored, delivered closes the order
    r := public.courier_webhook('pathao', '{"event": "order.in-transit", "consignment_id": "DT291025ABCD", "updated_at": "2026-10-29 10:00:00"}');
    perform public.courier_webhook('pathao', '{"event": "order.in-transit", "consignment_id": "DT291025ABCD", "updated_at": "2026-10-29 10:00:00"}');
    results := results || jsonb_build_object('name', 'webhook event stored once and shown on tracking', 'pass',
      (select count(*) from public.order_events where order_id = o1 and label = 'On the way' and is_public) = 1
      and (select courier_status from public.orders where id = o1) = 'On the way');

    r := public.courier_webhook('pathao', '{"event": "order.delivered", "consignment_id": "DT291025ABCD", "collected_amount": 870}');
    results := results || jsonb_build_object('name', 'delivered webhook marks the order delivered', 'pass',
      r->>'outcome' = 'delivered' and exists (select 1 from public.orders where id = o1 and status = 'delivered'));

    r := public.courier_webhook('pathao', '{"event": "order.returned", "consignment_id": "DT291025ABCD"}');
    results := results || jsonb_build_object('name', 'late return event cannot reopen a delivered order', 'pass',
      r->>'outcome' = 'recorded' and exists (select 1 from public.orders where id = o1 and status = 'delivered'));

    -- a returned parcel puts stock back
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    perform public.admin_confirm_order(o2);
    perform public.admin_courier_claim(o2);
    perform public.admin_courier_booked(o2, 'DT291025WXYZ', 130, null);
    r := public.courier_webhook('pathao', '{"event": "order.returned", "consignment_id": "DT291025WXYZ", "reason": "Customer refused"}');
    results := results || jsonb_build_object('name', 'returned webhook marks returned and restocks', 'pass',
      r->>'outcome' = 'returned' and exists (select 1 from public.orders where id = o2 and status = 'returned')
      and (select stock from public.products where id = pid) = 8);

    r := public.courier_webhook('pathao', '{"event": "order.picked", "consignment_id": "NOPE123"}');
    results := results || jsonb_build_object('name', 'unknown consignment is logged, not an error', 'pass', r->>'outcome' = 'no_matching_order');

    raise exception using errcode = 'YPRBK', message = 'self_test_rollback';
  exception when sqlstate 'YPRBK' then
    null;
  end;

  return jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(results) x where (x->>'pass')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not coalesce((x->>'pass')::boolean, false)),
    'results', results);
end $$;

grant execute on function public.run_courier_self_tests() to service_role;
