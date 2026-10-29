-- 0010 Admin panel (3/3): the two changes that replace or remove rows, kept
-- apart from 0008/0009 so those apply without a confirmation prompt.
--   * place_order now shares private.create_order with staff manual orders.
--   * admin_update_order replaces an order's lines when items are edited.

-- Storefront entry point: rate limits, then the shared create_order.
create or replace function public.place_order(p_order jsonb, p_client_key text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_phone text := private.normalize_bd_phone(p_order->>'phone');
  v_result jsonb;
begin
  if not private.hit_rate_limit('order:ip:' || coalesce(p_client_key, '?'), 8, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  if v_phone is not null
     and not private.hit_rate_limit('order:phone:' || v_phone, 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  begin
    v_result := private.create_order(p_order, 'web');
    return v_result - 'id';
  exception when sqlstate 'P0001' then
    declare
      v_message text;
      v_detail text;
    begin
      get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail;
      return jsonb_build_object('ok', false, 'error', v_message, 'quote', nullif(v_detail, '')::jsonb);
    end;
  end;
end $$;

-- Edit a pending/confirmed order. Items are re-priced from the catalogue and
-- stock is adjusted; fee and discount are what the operator enters.
-- p: {name?, phone?, address?, note?, delivery_fee?, discount?, items?: [{product_id, variant_id?, quantity}]}
create function public.admin_update_order(p_order_id uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
  v_phone text;
  v_quote jsonb;
  v_line jsonb;
  v_qty integer;
  v_n integer;
  v_subtotal integer;
  v_fee integer;
  v_discount integer;
  v_zone public.delivery_zones;
begin
  perform private.require_role('admin', 'manager', 'support');
  o := private.lock_order(p_order_id);
  if o.status not in ('pending', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'not_editable';
  end if;

  v_subtotal := o.subtotal;
  if p ? 'items' then
    v_quote := private.price_cart(p->'items', null, null);
    if not (v_quote->>'ok')::boolean then
      raise exception using errcode = 'P0001', message = 'cart_changed', detail = v_quote::text;
    end if;
    if o.status = 'confirmed' then perform private.adjust_sold_count(p_order_id, -1); end if;
    perform private.restock_order(p_order_id);
    delete from public.order_items where order_id = p_order_id;
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
    insert into public.order_items (order_id, product_id, variant_id, title, variant_name, unit_price, quantity, line_total)
    select p_order_id, (l->>'product_id')::uuid, (l->>'variant_id')::uuid, l->>'title', l->>'variant_name',
           (l->>'unit_price')::integer, (l->>'quantity')::integer, (l->>'line_total')::integer
    from jsonb_array_elements(v_quote->'lines') l;
    if o.status = 'confirmed' then perform private.adjust_sold_count(p_order_id, 1); end if;
    v_subtotal := (v_quote->>'subtotal')::integer;
  end if;

  if p ? 'phone' then
    v_phone := private.normalize_bd_phone(p->>'phone');
    if v_phone is null then
      raise exception using errcode = 'P0001', message = 'invalid_phone';
    end if;
  end if;
  if p ? 'name' and char_length(btrim(p->>'name')) not between 2 and 80 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if p ? 'address' and char_length(btrim(p->>'address')) not between 8 and 400 then
    raise exception using errcode = 'P0001', message = 'invalid_address';
  end if;
  if p ? 'address' then
    v_zone := private.resolve_delivery_zone(p->>'address');
  end if;
  if p ? 'delivery_fee' and coalesce(p->>'delivery_fee', '') !~ '^[0-9]{1,5}$' then
    raise exception using errcode = 'P0001', message = 'invalid_fee';
  end if;
  if p ? 'discount' and coalesce(p->>'discount', '') !~ '^[0-9]{1,6}$' then
    raise exception using errcode = 'P0001', message = 'invalid_discount';
  end if;

  v_fee := coalesce((p->>'delivery_fee')::integer, o.delivery_fee);
  v_discount := least(coalesce((p->>'discount')::integer, o.discount), v_subtotal);

  update public.orders set
    name = coalesce(btrim(p->>'name'), name),
    phone = coalesce(v_phone, phone),
    address = coalesce(btrim(p->>'address'), address),
    zone_code = coalesce(v_zone.code, zone_code),
    note = case when p ? 'note' then nullif(btrim(p->>'note'), '') else note end,
    subtotal = v_subtotal,
    discount = v_discount,
    delivery_fee = v_fee,
    total = v_subtotal - v_discount + v_fee
  where id = p_order_id;

  insert into public.order_events (order_id, kind, label, detail, source, actor_id, is_public)
  values (p_order_id, 'edit', 'Order edited', jsonb_build_object('changed', (select jsonb_agg(k) from jsonb_object_keys(p) k)),
          'operator', auth.uid(), false);
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.admin_update_order(uuid, jsonb) to authenticated;
