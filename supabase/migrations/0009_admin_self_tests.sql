-- 0009 Self-tests for the operator functions and role enforcement. Signs in as
-- simulated staff (JWT claims set for this transaction only) and checks that the
-- database itself refuses what a role may not do. Always rolled back.

create function public.run_admin_self_tests() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  results jsonb := '[]'::jsonb;
  u_admin uuid := gen_random_uuid();
  u_support uuid := gen_random_uuid();
  u_packer uuid := gen_random_uuid();
  t uuid;
  o1 jsonb;
  o2 jsonb;
  r jsonb;
  v_err text;
  n integer;
  dh constant text := 'বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা';
begin
  begin
    insert into auth.users (id, email, email_confirmed_at, aud, role)
    values (u_admin, 'st-admin@selftest.local', now(), 'authenticated', 'authenticated'),
           (u_support, 'st-support@selftest.local', now(), 'authenticated', 'authenticated'),
           (u_packer, 'st-packer@selftest.local', null, 'authenticated', 'authenticated');
    insert into private.staff_invites (email, role) values
      ('st-admin@selftest.local', 'admin'), ('st-packer@selftest.local', 'packer');
    insert into public.staff (user_id, email, role) values (u_support, 'st-support@selftest.local', 'support');
    insert into public.products (title, slug, price, stock, status)
      values ('Selftest A', 'selftest-a', 400, 10, 'active') returning id into t;

    -- invites: verified email becomes staff, unverified does not
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    r := public.claim_staff_invite();
    results := results || jsonb_build_object('name', 'invite: verified email is claimed as admin', 'pass', r->>'role' = 'admin');
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_packer, 'role', 'authenticated')::text, true);
    r := public.claim_staff_invite();
    results := results || jsonb_build_object('name', 'invite: unverified email is NOT claimed', 'pass', r is null);
    update auth.users set email_confirmed_at = now() where id = u_packer;
    r := public.claim_staff_invite();
    results := results || jsonb_build_object('name', 'invite: claimed once the email is verified', 'pass', r->>'role' = 'packer');

    -- manual orders: no rate limit, fee override
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_support, 'role', 'authenticated')::text, true);
    for i in 1..10 loop
      o1 := public.admin_create_order(jsonb_build_object('name', 'Phone order', 'phone', '01711222333',
        'address', dh, 'delivery_fee', 0, 'items', jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 1))));
    end loop;
    results := results || jsonb_build_object('name', 'manual order: 10 in a row, no rate limit, fee override', 'pass',
      (select count(*) from public.orders where phone = '8801711222333' and source = 'manual' and delivery_fee = 0 and total = 400) = 10
      and (select stock from public.products where id = t) = 0);
    update public.products set stock = 10 where id = t;

    o2 := public.admin_create_order(jsonb_build_object('name', 'Second', 'phone', '01811222333', 'address', dh,
      'items', jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 2))));

    -- packer may not confirm
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_packer, 'role', 'authenticated')::text, true);
    v_err := null;
    begin
      perform public.admin_confirm_order((o1->>'id')::uuid);
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'packer cannot confirm an order', 'pass', v_err = 'not_allowed');

    -- support confirms
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_support, 'role', 'authenticated')::text, true);
    perform public.admin_confirm_order((o1->>'id')::uuid);
    results := results || jsonb_build_object('name', 'support confirms: status + marketing confirmed, sold count +1', 'pass',
      exists (select 1 from public.orders where id = (o1->>'id')::uuid and status = 'confirmed'
              and marketing_status = 'confirmed' and confirmed_by = u_support)
      and (select sold_count from public.products where id = t) = 1);

    -- packer dispatches, but cannot mark delivered
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_packer, 'role', 'authenticated')::text, true);
    perform public.admin_set_status((o1->>'id')::uuid, 'dispatched');
    v_err := null;
    begin
      perform public.admin_set_status((o1->>'id')::uuid, 'delivered');
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'packer can dispatch but not mark delivered', 'pass',
      v_err = 'not_allowed' and exists (select 1 from public.orders where id = (o1->>'id')::uuid and status = 'dispatched'));

    -- nobody can jump back to confirmed through set_status
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    v_err := null;
    begin
      perform public.admin_set_status((o1->>'id')::uuid, 'confirmed');
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'set_status can never set confirmed', 'pass', v_err = 'invalid_transition');

    -- edit: items re-priced, stock adjusted, audited
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_support, 'role', 'authenticated')::text, true);
    perform public.admin_update_order((o2->>'id')::uuid, jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 3)), 'delivery_fee', 50, 'discount', 20));
    results := results || jsonb_build_object('name', 'edit: re-priced (3 x 400 - 20 + 50), stock adjusted', 'pass',
      exists (select 1 from public.orders where id = (o2->>'id')::uuid and subtotal = 1200 and total = 1230)
      and (select stock from public.products where id = t) = 7);
    results := results || jsonb_build_object('name', 'edit: recorded in audit log with who and before/after', 'pass',
      exists (select 1 from public.audit_log where actor_id = u_support and actor_role = 'support'
              and table_name = 'public.orders' and row_id = o2->>'id'
              and (before->>'total')::int = 870 and (after->>'total')::int = 1230));

    -- reject: cancelled, marketing rejected, stock back
    perform public.admin_reject_order((o2->>'id')::uuid, 'fake order');
    results := results || jsonb_build_object('name', 'reject: cancelled + marketing rejected + restocked', 'pass',
      exists (select 1 from public.orders where id = (o2->>'id')::uuid and status = 'cancelled' and marketing_status = 'rejected')
      and (select stock from public.products where id = t) = 10);

    -- customer check
    r := public.admin_customer_check('০১৭১১২২২৩৩৩');
    results := results || jsonb_build_object('name', 'customer check by Bangla-digit phone', 'pass', (r->>'orders')::int = 10);

    -- admin-only functions refuse support
    v_err := null;
    begin
      perform public.admin_team();
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'support cannot open team management', 'pass', v_err = 'not_allowed');
    v_err := null;
    begin
      perform public.admin_export_orders(current_date, current_date);
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'support cannot export CSV', 'pass', v_err = 'not_allowed');

    -- admin cannot lock themselves out
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    v_err := null;
    begin
      perform public.admin_update_staff(u_admin, 'support', true);
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'admin cannot demote themselves', 'pass', v_err = 'cannot_demote_self');

    -- customer orders (no signed-in user) are not audited as operator writes
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from public.audit_log;
    r := public.place_order(jsonb_build_object('name', 'Shopper', 'phone', '01911222333', 'address', dh,
      'items', jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 1))), 'selftest-admin');
    results := results || jsonb_build_object('name', 'storefront orders still work and are not audited as operator writes', 'pass',
      (r->>'ok')::boolean and (select count(*) from public.audit_log) = n);

    raise exception using errcode = 'YPRBK', message = 'self_test_rollback';
  exception when sqlstate 'YPRBK' then
    null;
  end;

  return jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(results) x where (x->>'pass')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not coalesce((x->>'pass')::boolean, false)),
    'results', results);
end $$;

revoke execute on function public.run_admin_self_tests() from public, anon, authenticated;
grant execute on function public.run_admin_self_tests() to service_role;
