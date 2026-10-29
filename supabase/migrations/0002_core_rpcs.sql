-- 0002 Core functions: normalisation, delivery zone matching, pricing,
-- place_order, order lookup, abandoned carts, newsletter, public settings.
--
-- Public write RPCs are granted to service_role ONLY. The browser never calls
-- them directly; it calls our Next.js API routes, which add the real client IP
-- for rate limiting. The server never trusts a price, fee or total from the
-- browser: everything is recomputed here from the products table.

-- ---------------------------------------------------------------- helpers
create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create function private.try_inet(p text) returns inet
language plpgsql immutable set search_path = '' as $$
begin
  return p::inet;
exception when others then
  return null;
end $$;

-- Bangla digits -> ASCII. Must run BEFORE stripping non-digits, otherwise
-- "০১৭১২৩৪৫৬৭৮" becomes "" and the customer cannot check out.
create function private.bn_digits(p text) returns text
language sql immutable set search_path = '' as $$
  select translate(coalesce(p, ''), '০১২৩৪৫৬৭৮৯', '0123456789')
$$;

-- One phone format everywhere: 8801XXXXXXXXX (13 digits). NULL if invalid.
-- Mirrored in lib/phone.js (tests in tests/phone.test.js and self-tests).
create function private.normalize_bd_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(private.bn_digits(p), '[^0-9]', '', 'g');
begin
  if d ~ '^008801[3-9][0-9]{8}$' then d := substr(d, 3); end if;
  if d ~ '^8801[3-9][0-9]{8}$' then return d; end if;
  if d ~ '^01[3-9][0-9]{8}$' then return '88' || d; end if;
  if d ~ '^1[3-9][0-9]{8}$' then return '880' || d; end if;
  return null;
end $$;

-- Loose text for address matching: Unicode NFC (so ড়/য় typed either way
-- compare equal), lower case, Bangla digits, and common spelling variants
-- (ী/ি, ূ/ু, ণ/ন, "gonj"/"ganj").
create function private.loose_text(p text) returns text
language sql immutable set search_path = '' as $$
  select replace(
    translate(lower(normalize(coalesce(p, ''), nfc)), 'ীূণ০১২৩৪৫৬৭৮৯', 'িুন0123456789'),
    'gonj', 'ganj')
$$;

create function private.resolve_delivery_zone(p_address text) returns public.delivery_zones
language plpgsql stable set search_path = '' as $$
declare
  a text := private.loose_text(p_address);
  z public.delivery_zones;
begin
  select dz.* into z
  from public.delivery_zones dz
  where exists (
    select 1 from unnest(dz.keywords) k
    where length(k) > 0 and position(private.loose_text(k) in a) > 0)
  order by dz.match_priority
  limit 1;
  if not found then
    select dz.* into z from public.delivery_zones dz where dz.is_default;
  end if;
  return z;
end $$;

-- Returns true if the call is allowed. Never raise after calling this if you
-- want the hit to count: an exception rolls the counter back too.
create function private.hit_rate_limit(p_key text, p_max integer, p_window interval) returns boolean
language plpgsql volatile set search_path = '' as $$
declare
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - p_window then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - p_window then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

create function private.new_order_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O, 1/I/L
  b bytea;
  c text;
begin
  loop
    b := extensions.gen_random_bytes(7);
    c := 'YP';
    for i in 0..6 loop
      c := c || substr(alphabet, 1 + (get_byte(b, i) % 31), 1);
    end loop;
    exit when not exists (select 1 from public.orders o where o.code = c);
  end loop;
  return c;
end $$;

-- ---------------------------------------------------------------- pricing
-- The single source of truth for what an order costs. Used by the live
-- checkout preview (quote_order) and by place_order, so they cannot drift.
-- p_items: [{product_id, variant_id?, quantity}] - nothing else is read.
create function private.price_cart(p_items jsonb, p_address text, p_coupon text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  r record;
  v_lines jsonb := '[]'::jsonb;
  v_ok boolean := true;
  v_subtotal integer := 0;
  v_problem text;
  v_available integer;
  v_threshold integer;
  v_zone public.delivery_zones;
  v_coupon public.coupons;
  v_coupon_code text := nullif(upper(btrim(coalesce(p_coupon, ''))), '');
  v_coupon_status text;
  v_discount integer := 0;
  v_free_reason text;
  v_fee integer;
  v_fee_original integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception using errcode = 'P0001', message = 'invalid_items';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) <> 'object'
       or private.try_uuid(e->>'product_id') is null
       or (e->>'variant_id' is not null and private.try_uuid(e->>'variant_id') is null)
       or coalesce(e->>'quantity', '') !~ '^[0-9]{1,2}$'
       or (e->>'quantity')::integer < 1) then
    raise exception using errcode = 'P0001', message = 'invalid_items';
  end if;

  for r in
    with merged as (
      select private.try_uuid(e->>'product_id') as product_id,
             private.try_uuid(e->>'variant_id') as variant_id,
             sum((e->>'quantity')::integer)::integer as quantity
      from jsonb_array_elements(p_items) e
      group by 1, 2
    )
    select m.product_id, m.variant_id, m.quantity,
           p.title, p.price, p.status, p.stock as product_stock,
           v.id as v_id, v.name as v_name, v.stock as v_stock, v.is_active as v_active,
           exists (select 1 from public.product_variants pv
                   where pv.product_id = m.product_id and pv.is_active) as has_variants
    from merged m
    left join public.products p on p.id = m.product_id
    left join public.product_variants v on v.id = m.variant_id and v.product_id = m.product_id
    order by m.product_id, m.variant_id nulls first
  loop
    v_problem := null;
    v_available := 0;
    if r.title is null or r.status <> 'active' then
      v_problem := 'unavailable';
    elsif r.variant_id is null and r.has_variants then
      v_problem := 'choose_variant';
    elsif r.variant_id is not null and (r.v_id is null or not r.v_active) then
      v_problem := 'unavailable';
    else
      v_available := case when r.variant_id is null then r.product_stock else r.v_stock end;
      if r.quantity > 99 then
        v_problem := 'too_many';
      elsif v_available < r.quantity then
        v_problem := case when v_available = 0 then 'out_of_stock' else 'insufficient_stock' end;
      end if;
    end if;

    if v_problem is null then
      v_subtotal := v_subtotal + r.price * r.quantity;
    else
      v_ok := false;
    end if;

    v_lines := v_lines || jsonb_build_object(
      'product_id', r.product_id,
      'variant_id', r.variant_id,
      'title', r.title,
      'variant_name', r.v_name,
      'unit_price', r.price,
      'quantity', r.quantity,
      'line_total', coalesce(r.price, 0) * r.quantity,
      'available', v_available,
      'problem', v_problem);
  end loop;

  -- Coupon. Free-shipping coupons only zero the delivery fee; they never
  -- touch item prices or any other discount.
  if v_coupon_code is not null then
    select c.* into v_coupon from public.coupons c where c.code = v_coupon_code;
    if not found or not v_coupon.is_active then
      v_coupon_status := 'invalid';
    elsif v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      v_coupon_status := 'not_started';
    elsif v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
      v_coupon_status := 'expired';
    elsif v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      v_coupon_status := 'used_up';
    elsif v_subtotal < v_coupon.min_order then
      v_coupon_status := 'min_order';
    else
      v_coupon_status := 'applied';
      if v_coupon.type = 'percent' then
        v_discount := floor(v_subtotal * v_coupon.value / 100.0)::integer;
        if v_coupon.max_discount is not null then
          v_discount := least(v_discount, v_coupon.max_discount);
        end if;
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_coupon.value, v_subtotal);
      else
        v_free_reason := 'coupon';
      end if;
    end if;
  end if;

  select s.free_shipping_threshold into v_threshold from public.store_settings s where s.id = 1;

  if nullif(btrim(coalesce(p_address, '')), '') is not null then
    v_zone := private.resolve_delivery_zone(p_address);
    v_fee_original := v_zone.fee;
    if v_free_reason is null and v_threshold is not null and v_subtotal > 0
       and v_subtotal - v_discount >= v_threshold then
      v_free_reason := 'threshold';
    end if;
    v_fee := case when v_free_reason is not null then 0 else v_fee_original end;
  end if;

  return jsonb_build_object(
    'ok', v_ok,
    'lines', v_lines,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_fee,
    'delivery_fee_original', v_fee_original,
    'zone', case when v_zone.code is null then null else jsonb_build_object(
      'code', v_zone.code, 'name', v_zone.name, 'eta', v_zone.eta_text) end,
    'free_shipping', v_free_reason,
    'free_shipping_threshold', v_threshold,
    'coupon', case when v_coupon_status is null then null else jsonb_build_object(
      'code', v_coupon_code, 'status', v_coupon_status, 'type', v_coupon.type,
      'min_order', v_coupon.min_order, 'id', v_coupon.id) end,
    'total', case when v_fee is null then null else v_subtotal - v_discount + v_fee end);
end $$;

-- ---------------------------------------------------------------- public RPCs

-- Live checkout preview. Coupon guesses are rate-limited.
create function public.quote_order(p_items jsonb, p_address text, p_coupon text, p_client_key text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if nullif(btrim(coalesce(p_coupon, '')), '') is not null
     and not private.hit_rate_limit('coupon:' || coalesce(p_client_key, '?'), 40, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return private.price_cart(p_items, p_address, p_coupon) #- '{coupon,id}';
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- The ONLY way an order is created from the storefront.
-- p_order: {name, phone, address, note?, email?, coupon?, items, fbp?, fbc?,
--           client_ip?, user_agent?, landing_url?, utm?}
-- Prices, fee, discount and total are recomputed; anything else the browser
-- sends (price, total, ...) is ignored.
create function public.place_order(p_order jsonb, p_client_key text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_phone text := private.normalize_bd_phone(p_order->>'phone');
  v_name text := btrim(coalesce(p_order->>'name', ''));
  v_address text := btrim(coalesce(p_order->>'address', ''));
  v_note text := nullif(btrim(coalesce(p_order->>'note', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_order->>'email', ''))), '');
  v_coupon_code text := nullif(upper(btrim(coalesce(p_order->>'coupon', ''))), '');
  v_quote jsonb;
  v_line jsonb;
  v_qty integer;
  v_n integer;
  v_coupon_id uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_code text;
begin
  if not private.hit_rate_limit('order:ip:' || coalesce(p_client_key, '?'), 8, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_phone is not null
     and not private.hit_rate_limit('order:phone:' || v_phone, 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  begin
    if char_length(v_name) < 2 or char_length(v_name) > 80 then
      raise exception using errcode = 'P0001', message = 'invalid_name';
    end if;
    if v_phone is null then
      raise exception using errcode = 'P0001', message = 'invalid_phone';
    end if;
    if char_length(v_address) < 8 or char_length(v_address) > 400 then
      raise exception using errcode = 'P0001', message = 'invalid_address';
    end if;
    if char_length(coalesce(v_note, '')) > 500 then
      raise exception using errcode = 'P0001', message = 'invalid_note';
    end if;
    if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception using errcode = 'P0001', message = 'invalid_email';
    end if;

    v_quote := private.price_cart(p_order->'items', v_address, v_coupon_code);

    if not (v_quote->>'ok')::boolean then
      return jsonb_build_object('ok', false, 'error', 'cart_changed', 'quote', v_quote #- '{coupon,id}');
    end if;
    if v_coupon_code is not null and v_quote->'coupon'->>'status' <> 'applied' then
      return jsonb_build_object('ok', false, 'error', 'coupon_' || (v_quote->'coupon'->>'status'),
                                'quote', v_quote #- '{coupon,id}');
    end if;

    -- Decrement stock atomically; a concurrent buyer of the last unit loses here.
    for v_line in select value from jsonb_array_elements(v_quote->'lines') loop
      v_qty := (v_line->>'quantity')::integer;
      if v_line->>'variant_id' is not null then
        update public.product_variants set stock = stock - v_qty
        where id = (v_line->>'variant_id')::uuid and stock >= v_qty;
      else
        update public.products set stock = stock - v_qty
        where id = (v_line->>'product_id')::uuid and stock >= v_qty;
      end if;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception using errcode = 'P0001', message = 'out_of_stock';
      end if;
    end loop;

    v_coupon_id := (v_quote->'coupon'->>'id')::uuid;
    if v_coupon_id is not null then
      update public.coupons set used_count = used_count + 1
      where id = v_coupon_id and (usage_limit is null or used_count < usage_limit);
      get diagnostics v_n = row_count;
      if v_n = 0 then
        raise exception using errcode = 'P0001', message = 'coupon_used_up';
      end if;
    end if;

    insert into public.customers as c (phone, name) values (v_phone, v_name)
    on conflict (phone) do update set name = excluded.name
    returning c.id into v_customer_id;
    if v_email is not null then
      update public.customers c set email = v_email
      where c.id = v_customer_id and c.email is null
        and not exists (select 1 from public.customers x where x.email = v_email);
    end if;

    v_code := private.new_order_code();
    insert into public.orders (
      code, customer_id, name, phone, email, address, zone_code, note,
      subtotal, discount, delivery_fee, delivery_fee_original, total,
      coupon_id, coupon_code,
      fbp, fbc, client_ip, client_user_agent, landing_url, utm)
    values (
      v_code, v_customer_id, v_name, v_phone, v_email, v_address, v_quote->'zone'->>'code', v_note,
      (v_quote->>'subtotal')::integer, (v_quote->>'discount')::integer,
      (v_quote->>'delivery_fee')::integer, (v_quote->>'delivery_fee_original')::integer,
      (v_quote->>'total')::integer,
      v_coupon_id, case when v_coupon_id is null then null else v_coupon_code end,
      left(p_order->>'fbp', 200), left(p_order->>'fbc', 300),
      private.try_inet(p_order->>'client_ip'), left(p_order->>'user_agent', 400),
      left(p_order->>'landing_url', 1000),
      case when jsonb_typeof(p_order->'utm') = 'object' and length((p_order->'utm')::text) <= 1000
           then p_order->'utm' end)
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, variant_id, title, variant_name, unit_price, quantity, line_total)
    select v_order_id, (l->>'product_id')::uuid, (l->>'variant_id')::uuid, l->>'title', l->>'variant_name',
           (l->>'unit_price')::integer, (l->>'quantity')::integer, (l->>'line_total')::integer
    from jsonb_array_elements(v_quote->'lines') l;

    insert into public.order_events (order_id, kind, status, label, source)
    values (v_order_id, 'status', 'pending', 'Order placed', 'customer');

    update public.abandoned_carts
    set status = 'recovered', recovered_order_id = v_order_id
    where phone = v_phone and status in ('open', 'contacted');

    return jsonb_build_object('ok', true, 'code', v_code, 'total', (v_quote->>'total')::integer);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end $$;

-- What a customer may see about an order: no full address, masked phone.
create function private.order_public_json(p_order_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'courier_status', o.courier_status,
    'created_at', o.created_at,
    'first_name', split_part(o.name, ' ', 1),
    'phone_masked', '0' || substr(o.phone, 4, 3) || '*****' || right(o.phone, 3),
    'zone', jsonb_build_object('name', z.name, 'eta', z.eta_text),
    'subtotal', o.subtotal, 'discount', o.discount, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'coupon_code', o.coupon_code,
    'payment_method', o.payment_method,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'title', i.title, 'variant_name', i.variant_name, 'quantity', i.quantity,
        'unit_price', i.unit_price, 'line_total', i.line_total) order by i.title)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('label', e.label, 'status', e.status, 'kind', e.kind, 'at', e.created_at)
                       order by e.created_at)
      from public.order_events e where e.order_id = o.id and e.is_public), '[]'::jsonb))
  from public.orders o
  join public.delivery_zones z on z.code = o.zone_code
  where o.id = p_order_id
$$;

-- Order confirmation page (server-rendered right after placing).
create function public.get_order_summary(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.order_public_json(o.id)
  from public.orders o where o.code = upper(btrim(p_code))
$$;

-- Track order from any device: needs the code AND the phone used to order.
create function public.track_order(p_code text, p_phone text, p_client_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.hit_rate_limit('track:' || coalesce(p_client_key, '?'), 15, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select o.id into v_id from public.orders o
  where o.code = upper(btrim(coalesce(p_code, '')))
    and o.phone = private.normalize_bd_phone(p_phone);
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'order', private.order_public_json(v_id));
end $$;

-- Called once a valid phone is typed at checkout. Re-priced from the catalogue.
create function public.capture_abandoned_cart(p_cart jsonb, p_client_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_phone text := private.normalize_bd_phone(p_cart->>'phone');
  v_quote jsonb;
begin
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if not private.hit_rate_limit('cart:' || coalesce(p_client_key, '?'), 30, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_quote := private.price_cart(p_cart->'items', null, null);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'error', 'invalid_items');
  end;
  insert into public.abandoned_carts (phone, name, address, items, subtotal)
  values (v_phone,
          left(nullif(btrim(coalesce(p_cart->>'name', '')), ''), 80),
          left(nullif(btrim(coalesce(p_cart->>'address', '')), ''), 400),
          v_quote->'lines', (v_quote->>'subtotal')::integer)
  on conflict (phone) where status in ('open', 'contacted') do update set
    name = coalesce(excluded.name, abandoned_carts.name),
    address = coalesce(excluded.address, abandoned_carts.address),
    items = excluded.items,
    subtotal = excluded.subtotal;
  return jsonb_build_object('ok', true);
end $$;

create function public.newsletter_subscribe(p_email text, p_client_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.hit_rate_limit('newsletter:' || coalesce(p_client_key, '?'), 5, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;
  insert into public.newsletter_subscribers (email) values (v_email)
  on conflict (email) do update set status = 'subscribed', unsubscribed_at = null
  where newsletter_subscribers.status = 'unsubscribed';
  return jsonb_build_object('ok', true);
end $$;

create function public.newsletter_unsubscribe(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update public.newsletter_subscribers
  set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsubscribe_token = private.try_uuid(p_token);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end $$;

-- Non-secret settings the storefront needs. Safe for anon.
create function public.get_public_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'maintenance_mode', s.maintenance_mode,
    'free_shipping_threshold', s.free_shipping_threshold,
    'integrations', s.integrations)
  from public.store_settings s where s.id = 1
$$;

create function public.get_delivery_zones() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', z.code, 'name', z.name, 'fee', z.fee, 'eta', z.eta_text)
                            order by z.fee, z.match_priority), '[]'::jsonb)
  from public.delivery_zones z
$$;

-- ---------------------------------------------------------------- catalogue view
create view public.product_cards with (security_invoker = true) as
select
  p.id, p.slug, p.title, p.price, p.compare_at_price, p.created_at, p.sold_count, p.is_sample, p.tags,
  c.slug as category_slug, c.name as category_name,
  (case when exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active)
        then (select coalesce(sum(v.stock), 0) from public.product_variants v
              where v.product_id = p.id and v.is_active)
        else p.stock end) > 0 as in_stock,
  img.storage_key as image_key, img.widths as image_widths,
  img.width as image_width, img.height as image_height, img.alt as image_alt,
  lower(p.title || ' ' || coalesce(c.name, '') || ' ' || array_to_string(p.tags, ' ')) as search_text
from public.products p
left join public.categories c on c.id = p.category_id
left join lateral (
  select i.storage_key, i.widths, i.width, i.height, i.alt
  from public.product_images i where i.product_id = p.id
  order by i.sort_order, i.created_at limit 1) img on true
where p.status = 'active';

grant select on public.product_cards to anon, authenticated;

-- ---------------------------------------------------------------- grants
grant execute on function public.quote_order(jsonb, text, text, text) to service_role;
grant execute on function public.place_order(jsonb, text) to service_role;
grant execute on function public.get_order_summary(text) to service_role;
grant execute on function public.track_order(text, text, text) to service_role;
grant execute on function public.capture_abandoned_cart(jsonb, text) to service_role;
grant execute on function public.newsletter_subscribe(text, text) to service_role;
grant execute on function public.newsletter_unsubscribe(text) to service_role;
grant execute on function public.get_public_settings() to anon, authenticated, service_role;
grant execute on function public.get_delivery_zones() to anon, authenticated, service_role;
