-- 0006 Fix self-test: the first ST-ONCE order used a one-letter name, which
-- place_order rightly rejects (min 2 chars), so the usage-limit case never ran.

create or replace function public.run_self_tests() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  results jsonb := '[]'::jsonb;
  cat uuid;
  t uuid;   -- plain product, price 1000, stock 3
  s uuid;   -- sale product, price 500 (compare-at 800), stock 5
  vp uuid;  -- product with colour variants
  vr uuid;  -- red variant, stock 2
  q jsonb;
  r jsonb;
  dh constant text := 'বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা';
  outside constant text := 'Agrabad, Chittagong';

begin
  -- ---------------------------------------------------- pure functions
  results := results || jsonb_build_array(
    jsonb_build_object('name', 'phone: Bangla digits', 'pass',
      private.normalize_bd_phone('০১৭১২৩৪৫৬৭৮') is not distinct from '8801712345678'),
    jsonb_build_object('name', 'phone: +880 with spaces and dashes', 'pass',
      private.normalize_bd_phone('+880 1712-345678') is not distinct from '8801712345678'),
    jsonb_build_object('name', 'phone: mixed Bangla/ASCII', 'pass',
      private.normalize_bd_phone('০১7১২ ৩৪৫ ৬৭৮') is not distinct from '8801712345678'),
    jsonb_build_object('name', 'phone: 10 digits without leading 0', 'pass',
      private.normalize_bd_phone('1912345678') is not distinct from '8801912345678'),
    jsonb_build_object('name', 'phone: 00880 prefix', 'pass',
      private.normalize_bd_phone('008801512345678') is not distinct from '8801512345678'),
    jsonb_build_object('name', 'phone: invalid operator digit rejected', 'pass',
      private.normalize_bd_phone('01212345678') is null),
    jsonb_build_object('name', 'phone: too short rejected', 'pass',
      private.normalize_bd_phone('0171234567') is null),
    jsonb_build_object('name', 'phone: letters only rejected', 'pass',
      private.normalize_bd_phone('abc') is null),

    jsonb_build_object('name', 'zone: Bangla Dhanmondi is inside Dhaka', 'pass',
      (private.resolve_delivery_zone(dh)).code = 'dhaka_inside'),
    jsonb_build_object('name', 'zone: English Mirpur is inside Dhaka', 'pass',
      (private.resolve_delivery_zone('House 3, Road 7, Mirpur 10')).code = 'dhaka_inside'),
    jsonb_build_object('name', 'zone: "সাভার, ঢাকা" is outskirts (checked before city)', 'pass',
      (private.resolve_delivery_zone('সাভার, ঢাকা')).code = 'dhaka_outskirts'),
    jsonb_build_object('name', 'zone: "Savar, Dhaka" is outskirts', 'pass',
      (private.resolve_delivery_zone('Bank Town, Savar, Dhaka')).code = 'dhaka_outskirts'),
    jsonb_build_object('name', 'zone: Daffodil Smart City, Ashulia is outskirts', 'pass',
      (private.resolve_delivery_zone('Daffodil Smart City, Ashulia')).code = 'dhaka_outskirts'),
    jsonb_build_object('name', 'zone: spelling variant নারায়নগঞ্জ is outskirts', 'pass',
      (private.resolve_delivery_zone('চাষাড়া, নারায়নগঞ্জ')).code = 'dhaka_outskirts'),
    jsonb_build_object('name', 'zone: spelling variant গাজিপুর is outskirts', 'pass',
      (private.resolve_delivery_zone('বোর্ড বাজার, গাজিপুর')).code = 'dhaka_outskirts'),
    jsonb_build_object('name', 'zone: "Tangail, Dhaka division" is outside Dhaka', 'pass',
      (private.resolve_delivery_zone('Tangail, Dhaka division')).code = 'outside_dhaka'),
    jsonb_build_object('name', 'zone: decomposed ড় (ড + nukta) still matches বগুড়া', 'pass',
      (private.resolve_delivery_zone('সাতমাথা, বগু' || 'ড' || chr(2492) || 'া')).code = 'outside_dhaka'),
    jsonb_build_object('name', 'zone: unknown place falls back to outside Dhaka', 'pass',
      (private.resolve_delivery_zone('Some village, nowhere')).code = 'outside_dhaka')
  );

  -- ---------------------------------------------------- writes (rolled back)
  begin
    update public.store_settings set free_shipping_threshold = 2000 where id = 1;
    insert into public.categories (name, slug) values ('Selftest', 'selftest-cat') returning id into cat;
    insert into public.products (title, slug, price, stock, status, category_id)
      values ('Selftest T', 'selftest-t', 1000, 3, 'active', cat) returning id into t;
    insert into public.products (title, slug, price, compare_at_price, stock, status, category_id)
      values ('Selftest S', 'selftest-s', 500, 800, 5, 'active', cat) returning id into s;
    insert into public.products (title, slug, price, stock, status, category_id)
      values ('Selftest V', 'selftest-v', 300, 0, 'active', cat) returning id into vp;
    insert into public.product_variants (product_id, name, stock) values (vp, 'Red', 2) returning id into vr;
    insert into public.product_variants (product_id, name, stock) values (vp, 'Blue', 0);
    insert into public.coupons (code, type, value) values ('ST-PCT10', 'percent', 10);
    insert into public.coupons (code, type, value) values ('ST-FIX300', 'fixed', 300);
    insert into public.coupons (code, type, value) values ('ST-FREESHIP', 'free_shipping', 0);
    insert into public.coupons (code, type, value, min_order) values ('ST-MIN5000', 'fixed', 100, 5000);
    insert into public.coupons (code, type, value, expires_at) values ('ST-OLD', 'fixed', 100, now() - interval '1 day');
    insert into public.coupons (code, type, value, usage_limit) values ('ST-ONCE', 'fixed', 50, 1);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 1)), dh, null);
    results := results || jsonb_build_object('name', 'price: 1 item inside Dhaka = 1000 + 70', 'pass',
      (q->>'subtotal')::int = 1000 and (q->>'delivery_fee')::int = 70 and (q->>'total')::int = 1070);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 1, 'price', 1, 'unit_price', 1)), dh, null);
    results := results || jsonb_build_object('name', 'price: browser-sent price is ignored', 'pass',
      (q->'lines'->0->>'unit_price')::int = 1000 and (q->>'total')::int = 1070);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 2)), outside, null);
    results := results || jsonb_build_object('name', 'fee: free delivery at 2000 threshold', 'pass',
      (q->>'delivery_fee')::int = 0 and (q->>'delivery_fee_original')::int = 130
      and q->>'free_shipping' = 'threshold' and (q->>'total')::int = 2000);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 2)), dh, 'st-pct10');
    results := results || jsonb_build_object('name', 'coupon: 10% (case-insensitive), drops below threshold so fee applies', 'pass',
      q->'coupon'->>'status' = 'applied' and (q->>'discount')::int = 200
      and (q->>'delivery_fee')::int = 70 and (q->>'total')::int = 1870);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1)), outside, 'ST-FREESHIP');
    results := results || jsonb_build_object('name', 'coupon: free shipping zeroes fee only, sale price kept', 'pass',
      (q->'lines'->0->>'unit_price')::int = 500 and (q->>'discount')::int = 0
      and (q->>'delivery_fee')::int = 0 and (q->>'delivery_fee_original')::int = 130
      and (q->>'total')::int = 500);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1)), dh, 'ST-FIX300');
    results := results || jsonb_build_object('name', 'coupon: fixed 300 off', 'pass',
      (q->>'discount')::int = 300 and (q->>'total')::int = 270);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1)), dh, 'ST-MIN5000');
    results := results || jsonb_build_object('name', 'coupon: min order not met', 'pass',
      q->'coupon'->>'status' = 'min_order' and (q->>'discount')::int = 0);

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1)), dh, 'ST-OLD');
    results := results || jsonb_build_object('name', 'coupon: expired', 'pass', q->'coupon'->>'status' = 'expired');

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1)), dh, 'NOPE-123');
    results := results || jsonb_build_object('name', 'coupon: unknown code', 'pass', q->'coupon'->>'status' = 'invalid');

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 4)), dh, null);
    results := results || jsonb_build_object('name', 'stock: more than available is flagged', 'pass',
      (q->>'ok')::boolean = false and q->'lines'->0->>'problem' = 'insufficient_stock');

    q := private.price_cart(jsonb_build_array(jsonb_build_object('product_id', vp, 'quantity', 1)), dh, null);
    results := results || jsonb_build_object('name', 'variant: must choose a colour', 'pass',
      q->'lines'->0->>'problem' = 'choose_variant');

    q := private.price_cart(jsonb_build_array(
      jsonb_build_object('product_id', t, 'quantity', 1),
      jsonb_build_object('product_id', t, 'quantity', 1)), dh, null);
    results := results || jsonb_build_object('name', 'price: duplicate lines are merged', 'pass',
      jsonb_array_length(q->'lines') = 1 and (q->'lines'->0->>'quantity')::int = 2);

    -- abandoned cart is captured, then recovered by the order
    r := public.capture_abandoned_cart(jsonb_build_object('phone', '০১৭১১০০০০০১',
      'items', jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 1))), 'selftest-cart');
    results := results || jsonb_build_object('name', 'abandoned cart: captured with Bangla phone', 'pass',
      (r->>'ok')::boolean and exists (select 1 from public.abandoned_carts
        where phone = '8801711000001' and status = 'open' and subtotal = 1000));

    r := public.place_order(jsonb_build_object(
      'name', 'রহিম উদ্দিন', 'phone', '০১৭১১০০০০০১', 'address', dh, 'total', 1, 'subtotal', 1,
      'items', jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 2, 'price', 1))), 'selftest-1');
    results := results || jsonb_build_object('name', 'place_order: succeeds and re-prices', 'pass',
      (r->>'ok')::boolean and (r->>'total')::int = 2000
      and exists (select 1 from public.orders o where o.code = r->>'code'
                  and o.phone = '8801711000001' and o.total = 2000 and o.delivery_fee = 0
                  and o.status = 'pending' and o.marketing_status = 'pending'));
    results := results || jsonb_build_object('name', 'place_order: stock decremented', 'pass',
      (select stock from public.products where id = t) = 1);
    results := results || jsonb_build_object('name', 'place_order: abandoned cart marked recovered', 'pass',
      exists (select 1 from public.abandoned_carts where phone = '8801711000001' and status = 'recovered'));

    r := public.place_order(jsonb_build_object(
      'name', 'Karim', 'phone', '01811000002', 'address', dh,
      'items', jsonb_build_array(jsonb_build_object('product_id', t, 'quantity', 2))), 'selftest-2');
    results := results || jsonb_build_object('name', 'place_order: refuses more than stock', 'pass',
      (r->>'ok')::boolean = false and r->>'error' = 'cart_changed'
      and (select stock from public.products where id = t) = 1);

    r := public.place_order(jsonb_build_object(
      'name', 'Karim', 'phone', '01811000002', 'address', dh,
      'items', jsonb_build_array(jsonb_build_object('product_id', vp, 'variant_id', vr, 'quantity', 2))), 'selftest-3');
    results := results || jsonb_build_object('name', 'place_order: variant stock decremented', 'pass',
      (r->>'ok')::boolean and (select stock from public.product_variants where id = vr) = 0);

    r := public.place_order(jsonb_build_object(
      'name', 'Karim', 'phone', 'not a phone', 'address', dh,
      'items', jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1))), 'selftest-4');
    results := results || jsonb_build_object('name', 'place_order: invalid phone refused', 'pass',
      r->>'error' = 'invalid_phone');

    r := public.place_order(jsonb_build_object(
      'name', 'Ana', 'phone', '01911000003', 'address', dh, 'coupon', 'ST-ONCE',
      'items', jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1))), 'selftest-5');
    r := public.place_order(jsonb_build_object(
      'name', 'Bea', 'phone', '01911000004', 'address', dh, 'coupon', 'ST-ONCE',
      'items', jsonb_build_array(jsonb_build_object('product_id', s, 'quantity', 1))), 'selftest-6');
    results := results || jsonb_build_object('name', 'coupon: usage limit enforced across orders', 'pass',
      r->>'error' = 'coupon_used_up' and (select used_count from public.coupons where code = 'ST-ONCE') = 1);

    raise exception using errcode = 'YPRBK', message = 'self_test_rollback';
  exception when sqlstate 'YPRBK' then
    null;  -- everything above is rolled back
  end;

  return jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(results) x where (x->>'pass')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not coalesce((x->>'pass')::boolean, false)),
    'results', results);
end $$;
