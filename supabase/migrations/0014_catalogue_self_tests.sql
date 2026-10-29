-- 0014 Self-tests for catalogue management (phase 4). Always rolled back.

create function public.run_catalog_self_tests() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  results jsonb := '[]'::jsonb;
  u_manager uuid := gen_random_uuid();
  u_support uuid := gen_random_uuid();
  cat uuid;
  r jsonb;
  r2 jsonb;
  v_err text;
  pid uuid;
  key1 constant text := 'products/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222';
begin
  begin
    insert into auth.users (id, email, email_confirmed_at, aud, role) values
      (u_manager, 'st-manager@selftest.local', now(), 'authenticated', 'authenticated'),
      (u_support, 'st-support2@selftest.local', now(), 'authenticated', 'authenticated');
    insert into public.staff (user_id, email, role) values
      (u_manager, 'st-manager@selftest.local', 'manager'), (u_support, 'st-support2@selftest.local', 'support');
    insert into public.categories (name, slug) values ('Selftest Cat', 'selftest-cat') returning id into cat;

    -- support may not change the catalogue
    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_support, 'role', 'authenticated')::text, true);
    v_err := null;
    begin
      perform public.admin_save_product(jsonb_build_object('title', 'X', 'price', 10));
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'support cannot create products', 'pass', v_err = 'not_allowed');

    perform set_config('request.jwt.claims', jsonb_build_object('sub', u_manager, 'role', 'authenticated')::text, true);
    r := public.admin_save_product(jsonb_build_object('title', 'Selftest Lamp', 'price', '500', 'compare_at_price', '400',
      'status', 'active', 'category_id', cat, 'tags', 'Light, LAMP , light',
      'variants', jsonb_build_array(jsonb_build_object('name', 'Red', 'color_hex', '#FF0000', 'stock', 3),
                                    jsonb_build_object('name', 'Blue', 'stock', 2)),
      'images', jsonb_build_array(jsonb_build_object('storage_key', key1, 'widths', jsonb_build_array(400, 800), 'width', 1000, 'height', 800))));
    pid := (r->>'id')::uuid;
    results := results || jsonb_build_object('name', 'manager creates product: slug, tags tidied, compare-at below price dropped', 'pass',
      r->>'slug' = 'selftest-lamp'
      and exists (select 1 from public.products where id = pid and compare_at_price is null and tags = array['lamp', 'light'])
      and (select count(*) from public.product_variants where product_id = pid and is_active) = 2
      and (select count(*) from public.product_images where product_id = pid) = 1);

    r2 := public.admin_save_product(jsonb_build_object('title', 'Selftest Lamp', 'price', 100));
    results := results || jsonb_build_object('name', 'same title gets a unique slug', 'pass', r2->>'slug' = 'selftest-lamp-2');

    perform public.admin_save_product(jsonb_build_object('id', pid, 'title', 'Selftest Lamp', 'price', 550, 'status', 'active',
      'variants', jsonb_build_array(jsonb_build_object('name', 'Blue', 'stock', 5))));
    results := results || jsonb_build_object('name', 'removed colour is deactivated, not deleted (order history kept)', 'pass',
      exists (select 1 from public.product_variants where product_id = pid and name = 'Red' and not is_active)
      and exists (select 1 from public.product_variants where product_id = pid and name = 'Blue' and is_active and stock = 5));

    v_err := null;
    begin
      perform public.admin_save_product(jsonb_build_object('title', 'Bad', 'price', 1,
        'images', jsonb_build_array(jsonb_build_object('storage_key', 'https://evil.example/x'))));
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'image keys must come from our uploader', 'pass', v_err = 'invalid_image');

    perform public.admin_bulk_update_products(array[pid, (r2->>'id')::uuid], jsonb_build_object('price_change_percent', '-10', 'status', 'hidden'));
    results := results || jsonb_build_object('name', 'bulk edit: -10% price and hide', 'pass',
      (select price from public.products where id = pid) = 495
      and (select count(*) from public.products where id in (pid, (r2->>'id')::uuid) and status = 'hidden') = 2);

    v_err := null;
    begin
      perform public.admin_save_coupon(jsonb_build_object('code', 'big', 'type', 'percent', 'value', 150));
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'coupon over 100% refused', 'pass', v_err = 'invalid_percent');
    r := public.admin_save_coupon(jsonb_build_object('code', 'st-ship', 'type', 'free_shipping', 'value', 99, 'min_order', 1000));
    results := results || jsonb_build_object('name', 'free-shipping coupon stored upper-case with value 0', 'pass',
      exists (select 1 from public.coupons where code = 'ST-SHIP' and value = 0 and min_order = 1000));

    v_err := null;
    begin
      perform public.admin_import_products(
        jsonb_build_array(jsonb_build_object('title', 'Import A', 'category', 'selftest cat', 'price', 100),
                          jsonb_build_object('title', 'Import B', 'category', 'No Such Cat', 'price', 100)), '[]'::jsonb);
    exception when others then v_err := sqlerrm;
    end;
    results := results || jsonb_build_object('name', 'import is all-or-nothing and names the bad row', 'pass',
      v_err = 'import_row_2:unknown_category' and not exists (select 1 from public.products where title = 'Import A'));

    r := public.admin_import_products(
      jsonb_build_array(jsonb_build_object('title', 'Import A', 'category', 'Selftest Cat', 'price', '120', 'stock', '4',
                                           'photo_files', jsonb_build_array('a-1.jpg', 'A-2.JPG'))),
      jsonb_build_array(jsonb_build_object('product_title', 'import a', 'name', 'Green', 'stock', 2)));
    results := results || jsonb_build_object('name', 'import creates products, colours and the photo waiting list', 'pass',
      (r->>'created')::int = 1 and exists (select 1 from public.products p join public.product_variants v on v.product_id = p.id
        where p.title = 'Import A' and v.name = 'Green' and p.import_photo_files = array['a-1.jpg', 'A-2.JPG']));

    select id into pid from public.products where title = 'Import A';
    perform public.admin_attach_product_images(pid, jsonb_build_array(jsonb_build_object('storage_key', key1)), array['a-2.jpg']);
    results := results || jsonb_build_object('name', 'attaching photos strikes matched names (case-insensitive)', 'pass',
      exists (select 1 from public.products where id = pid and import_photo_files = array['a-1.jpg']));

    perform public.admin_remove_product_image((select id from public.product_images where product_id = pid limit 1));
    perform public.admin_delete_product((r2->>'id')::uuid);
    results := results || jsonb_build_object('name', 'manager can remove an image and delete a product', 'pass',
      not exists (select 1 from public.product_images where product_id = pid)
      and not exists (select 1 from public.products where id = (r2->>'id')::uuid));

    raise exception using errcode = 'YPRBK', message = 'self_test_rollback';
  exception when sqlstate 'YPRBK' then
    null;
  end;

  return jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(results) x where (x->>'pass')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) x where not coalesce((x->>'pass')::boolean, false)),
    'results', results);
end $$;

grant execute on function public.run_catalog_self_tests() to service_role;
