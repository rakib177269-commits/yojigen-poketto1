-- 0009 Admin panel (2/3): operator functions (confirm, reject, status, manual
-- order, customer check, abandoned carts, team, settings, export). See 0008.

-- ---------------------------------------------------------------- order creation (shared)
-- The body of place_order, minus rate limits, so operators can enter phone and
-- Facebook orders through exactly the same pricing and stock rules.
-- p_source 'manual' may also pass delivery_fee to override the zone fee.
create function private.create_order(p_order jsonb, p_source text) returns jsonb
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
  v_fee integer;
  v_coupon_id uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_code text;
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
    raise exception using errcode = 'P0001', message = 'cart_changed', detail = (v_quote #- '{coupon,id}')::text;
  end if;
  if v_coupon_code is not null and v_quote->'coupon'->>'status' <> 'applied' then
    raise exception using errcode = 'P0001', message = 'coupon_' || (v_quote->'coupon'->>'status'),
      detail = (v_quote #- '{coupon,id}')::text;
  end if;

  v_fee := (v_quote->>'delivery_fee')::integer;
  if p_source = 'manual' and coalesce(p_order->>'delivery_fee', '') ~ '^[0-9]{1,5}$' then
    v_fee := (p_order->>'delivery_fee')::integer;
  end if;

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
    code, customer_id, source, name, phone, email, address, zone_code, note,
    subtotal, discount, delivery_fee, delivery_fee_original, total,
    coupon_id, coupon_code,
    fbp, fbc, client_ip, client_user_agent, landing_url, utm)
  values (
    v_code, v_customer_id, p_source, v_name, v_phone, v_email, v_address, v_quote->'zone'->>'code', v_note,
    (v_quote->>'subtotal')::integer, (v_quote->>'discount')::integer,
    v_fee, (v_quote->>'delivery_fee_original')::integer,
    (v_quote->>'subtotal')::integer - (v_quote->>'discount')::integer + v_fee,
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

  insert into public.order_events (order_id, kind, status, label, source, actor_id)
  values (v_order_id, 'status', 'pending', 'Order placed',
          case when p_source = 'manual' then 'operator' else 'customer' end, auth.uid());

  update public.abandoned_carts
  set status = 'recovered', recovered_order_id = v_order_id
  where phone = v_phone and status in ('open', 'contacted');

  return jsonb_build_object('ok', true, 'id', v_order_id, 'code', v_code,
    'total', (v_quote->>'subtotal')::integer - (v_quote->>'discount')::integer + v_fee);
end $$;

-- ---------------------------------------------------------------- operator helpers
create function private.restock_order(p_order_id uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.product_variants v set stock = v.stock + i.quantity
  from public.order_items i where i.order_id = p_order_id and i.variant_id = v.id;
  update public.products p set stock = p.stock + i.quantity
  from public.order_items i where i.order_id = p_order_id and i.variant_id is null and i.product_id = p.id;
$$;

create function private.adjust_sold_count(p_order_id uuid, p_sign integer) returns void
language sql volatile security definer set search_path = '' as $$
  update public.products p set sold_count = greatest(0, p.sold_count + p_sign * x.qty)
  from (select product_id, sum(quantity)::integer as qty from public.order_items
        where order_id = p_order_id and product_id is not null group by product_id) x
  where p.id = x.product_id;
$$;

create function private.lock_order(p_order_id uuid) returns public.orders
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------- operator RPCs
create function public.current_staff() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', s.user_id, 'email', s.email, 'name', s.name, 'role', s.role)
  from public.staff s where s.user_id = auth.uid() and s.is_active
$$;

-- Called right after sign-in: turns a pending invite for this VERIFIED email
-- into a staff row.
create function public.claim_staff_invite() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text;
  v_invite private.staff_invites;
begin
  select lower(u.email) into v_email from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is not null then
    select * into v_invite from private.staff_invites
    where email = v_email and claimed_at is null and cancelled_at is null;
    if found then
      insert into public.staff (user_id, email, role) values (auth.uid(), v_email, v_invite.role)
      on conflict (user_id) do update set role = excluded.role, email = excluded.email, is_active = true;
      update private.staff_invites set claimed_at = now(), claimed_by = auth.uid() where email = v_email;
    end if;
  end if;
  return public.current_staff();
end $$;

-- Server-side check before emailing a sign-in link, so the login form cannot be
-- used to create accounts for random addresses or to spam inboxes.
create function public.staff_login_allowed(p_email text, p_client_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.hit_rate_limit('stafflogin:' || coalesce(p_client_key, '?'), 5, interval '10 minutes')
     or not private.hit_rate_limit('stafflogin:' || v_email, 3, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return jsonb_build_object('ok', exists (select 1 from public.staff s where s.email = v_email and s.is_active)
                                  or exists (select 1 from private.staff_invites i where i.email = v_email
                                                 and i.claimed_at is null and i.cancelled_at is null));
end $$;

create function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today timestamptz := (date_trunc('day', now() at time zone 'Asia/Dhaka')) at time zone 'Asia/Dhaka';
  v_week timestamptz := (date_trunc('week', now() at time zone 'Asia/Dhaka')) at time zone 'Asia/Dhaka';
  counted constant public.order_status[] := array['confirmed', 'dispatched', 'delivered']::public.order_status[];
begin
  perform private.require_role('admin', 'manager', 'support');
  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders where created_at >= v_today),
    'orders_week', (select count(*) from public.orders where created_at >= v_week),
    'revenue_today', (select coalesce(sum(total), 0) from public.orders where created_at >= v_today and status = any (counted)),
    'revenue_week', (select coalesce(sum(total), 0) from public.orders where created_at >= v_week and status = any (counted)),
    'pending', (select count(*) from public.orders where status = 'pending'),
    'to_dispatch', (select count(*) from public.orders where status = 'confirmed'),
    -- Meta ignores conversion events older than 7 days: confirm before day 4.
    'stale_pending', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'created_at', created_at) order by created_at)
      from public.orders where status = 'pending' and created_at < now() - interval '4 days'), '[]'::jsonb),
    'abandoned_open', (select count(*) from public.abandoned_carts where status = 'open'),
    'low_stock', coalesce((select jsonb_agg(x order by (x->>'stock')::int) from (
        select jsonb_build_object('product_id', p.id, 'title', p.title, 'variant', null, 'stock', p.stock) x
        from public.products p
        where p.status = 'active' and p.stock <= 3
          and not exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active)
        union all
        select jsonb_build_object('product_id', p.id, 'title', p.title, 'variant', v.name, 'stock', v.stock)
        from public.product_variants v join public.products p on p.id = v.product_id
        where p.status = 'active' and v.is_active and v.stock <= 3) s), '[]'::jsonb));
end $$;

create function public.admin_confirm_order(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
begin
  perform private.require_role('admin', 'manager', 'support');
  o := private.lock_order(p_order_id);
  if o.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'not_pending';
  end if;
  update public.orders set status = 'confirmed', marketing_status = 'confirmed',
    confirmed_at = now(), confirmed_by = auth.uid()
  where id = p_order_id;
  perform private.adjust_sold_count(p_order_id, 1);
  insert into public.order_events (order_id, kind, status, label, source, actor_id)
  values (p_order_id, 'status', 'confirmed', 'Order confirmed', 'operator', auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Fake / spam order: cancelled, never counted as a sale or sent to Meta.
create function public.admin_reject_order(p_order_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
begin
  perform private.require_role('admin', 'manager', 'support');
  o := private.lock_order(p_order_id);
  if o.status not in ('pending', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'cannot_reject';
  end if;
  update public.orders set status = 'cancelled', marketing_status = 'rejected',
    rejected_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 300)
  where id = p_order_id;
  perform private.restock_order(p_order_id);
  if o.status = 'confirmed' then
    perform private.adjust_sold_count(p_order_id, -1);
  end if;
  insert into public.order_events (order_id, kind, status, label, detail, source, actor_id)
  values (p_order_id, 'status', 'cancelled', 'Order cancelled',
          jsonb_build_object('rejected', true, 'reason', p_reason), 'operator', auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Moves an order along. Confirming has its own function; nothing here can
-- set 'confirmed'.
create function public.admin_set_status(p_order_id uuid, p_status public.order_status, p_note text default null,
                                        p_restock boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
  v_role public.staff_role := private.require_role('admin', 'manager', 'support', 'packer');
  v_label text;
begin
  o := private.lock_order(p_order_id);
  if p_status = 'dispatched' and o.status = 'confirmed' then
    v_label := 'Handed to courier';
  elsif v_role = 'packer' then
    raise exception using errcode = '42501', message = 'not_allowed';
  elsif p_status = 'delivered' and o.status = 'dispatched' then
    v_label := 'Delivered';
  elsif p_status = 'returned' and o.status = 'dispatched' then
    v_label := 'Returned to us';
  elsif p_status = 'cancelled' and o.status in ('pending', 'confirmed') then
    v_label := 'Order cancelled';
  else
    raise exception using errcode = 'P0001', message = 'invalid_transition';
  end if;

  update public.orders set status = p_status,
    marketing_status = case when p_status = 'cancelled' and marketing_status = 'pending' then 'rejected' else marketing_status end
  where id = p_order_id;
  if p_status in ('cancelled', 'returned') and p_restock then
    perform private.restock_order(p_order_id);
  end if;
  if p_status in ('cancelled', 'returned') and o.status in ('confirmed', 'dispatched') then
    perform private.adjust_sold_count(p_order_id, -1);
  end if;
  insert into public.order_events (order_id, kind, status, label, detail, source, actor_id)
  values (p_order_id, 'status', p_status, v_label,
          case when nullif(btrim(coalesce(p_note, '')), '') is null then null
               else jsonb_build_object('note', left(p_note, 500)) end,
          'operator', auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Phone / Facebook orders entered by staff. Same pricing and stock rules as the
-- shop, no rate limit, optional delivery fee override.
create function public.admin_create_order(p_order jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager', 'support');
  return private.create_order(p_order, 'manual');
end $$;

-- Before confirming a COD order: how has this phone number behaved before?
create function public.admin_customer_check(p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text := private.normalize_bd_phone(p_phone);
  v_delivered integer;
  v_returned integer;
begin
  perform private.require_role('admin', 'manager', 'support');
  if v_phone is null then
    raise exception using errcode = 'P0001', message = 'invalid_phone';
  end if;
  select count(*) filter (where status = 'delivered'), count(*) filter (where status = 'returned')
  into v_delivered, v_returned from public.orders where phone = v_phone;
  return jsonb_build_object(
    'phone', v_phone,
    'orders', (select count(*) from public.orders where phone = v_phone),
    'delivered', v_delivered,
    'returned', v_returned,
    'cancelled', (select count(*) from public.orders where phone = v_phone and status = 'cancelled'),
    'rejected', (select count(*) from public.orders where phone = v_phone and marketing_status = 'rejected'),
    'pending', (select count(*) from public.orders where phone = v_phone and status in ('pending', 'confirmed', 'dispatched')),
    'success_rate', case when v_delivered + v_returned > 0
                         then round(100.0 * v_delivered / (v_delivered + v_returned)) end,
    'names', coalesce((select jsonb_agg(distinct name) from public.orders where phone = v_phone), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'status', status, 'total', total, 'created_at', created_at) order by created_at desc)
                        from (select * from public.orders where phone = v_phone order by created_at desc limit 10) r), '[]'::jsonb));
end $$;

create function public.admin_update_abandoned_cart(p_id uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager', 'support');
  if p_status not in ('contacted', 'dismissed', 'open') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;
  update public.abandoned_carts set status = p_status,
    contacted_at = case when p_status = 'contacted' then now() else contacted_at end,
    contacted_by = case when p_status = 'contacted' then auth.uid() else contacted_by end
  where id = p_id and status <> 'recovered';
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- admin-only
create function public.admin_update_settings(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  if p ? 'free_shipping_threshold' and p->>'free_shipping_threshold' is not null
     and p->>'free_shipping_threshold' !~ '^[0-9]{1,6}$' then
    raise exception using errcode = 'P0001', message = 'invalid_threshold';
  end if;
  update public.store_settings set
    maintenance_mode = coalesce((p->>'maintenance_mode')::boolean, maintenance_mode),
    free_shipping_threshold = case when p ? 'free_shipping_threshold'
                                   then (p->>'free_shipping_threshold')::integer else free_shipping_threshold end
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_update_zone(p_code text, p_fee integer, p_eta text, p_keywords text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  if p_fee is null or p_fee < 0 or p_fee > 10000 then
    raise exception using errcode = 'P0001', message = 'invalid_fee';
  end if;
  update public.delivery_zones set fee = p_fee, eta_text = nullif(btrim(coalesce(p_eta, '')), ''),
    keywords = coalesce((select array_agg(distinct lower(btrim(k))) from unnest(p_keywords) k where btrim(k) <> ''), '{}')
  where code = p_code;
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_team() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  return jsonb_build_object(
    'staff', coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'email', s.email, 'name', s.name,
                                                            'role', s.role, 'is_active', s.is_active, 'created_at', s.created_at)
                                         order by s.created_at) from public.staff s), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'created_at', i.created_at)
                                          order by i.created_at) from private.staff_invites i
                        where i.claimed_at is null and i.cancelled_at is null), '[]'::jsonb));
end $$;

create function public.admin_invite_staff(p_email text, p_role public.staff_role) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform private.require_role('admin');
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'P0001', message = 'invalid_email';
  end if;
  if exists (select 1 from public.staff where email = v_email) then
    raise exception using errcode = 'P0001', message = 'already_staff';
  end if;
  insert into private.staff_invites (email, role, invited_by) values (v_email, p_role, auth.uid())
  on conflict (email) do update set role = excluded.role, invited_by = excluded.invited_by,
    created_at = now(), claimed_at = null, claimed_by = null, cancelled_at = null;
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_cancel_invite(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  update private.staff_invites set cancelled_at = now()
  where email = lower(btrim(p_email)) and claimed_at is null;
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_update_staff(p_user_id uuid, p_role public.staff_role, p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  if p_user_id = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception using errcode = 'P0001', message = 'cannot_demote_self';
  end if;
  update public.staff set role = p_role, is_active = p_active where user_id = p_user_id;
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_export_orders(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('admin');
  return coalesce((select jsonb_agg(jsonb_build_object(
      'code', o.code, 'created_at', o.created_at, 'status', o.status, 'marketing_status', o.marketing_status,
      'source', o.source, 'name', o.name, 'phone', o.phone, 'address', o.address, 'zone', o.zone_code,
      'items', (select string_agg(i.title || coalesce(' (' || i.variant_name || ')', '') || ' x' || i.quantity, '; ')
                from public.order_items i where i.order_id = o.id),
      'subtotal', o.subtotal, 'discount', o.discount, 'delivery_fee', o.delivery_fee, 'total', o.total,
      'coupon', o.coupon_code, 'note', o.note) order by o.created_at)
    from public.orders o
    where o.created_at >= (p_from::timestamp at time zone 'Asia/Dhaka')
      and o.created_at < ((p_to + 1)::timestamp at time zone 'Asia/Dhaka')), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- grants
-- New functions get no PUBLIC execute (0007 changed the default), so only grant.
grant execute on function public.current_staff(), public.claim_staff_invite(), public.admin_dashboard(),
  public.admin_confirm_order(uuid), public.admin_reject_order(uuid, text),
  public.admin_set_status(uuid, public.order_status, text, boolean),
  public.admin_create_order(jsonb), public.admin_customer_check(text), public.admin_update_abandoned_cart(uuid, text),
  public.admin_update_settings(jsonb), public.admin_update_zone(text, integer, text, text[]), public.admin_team(),
  public.admin_invite_staff(text, public.staff_role), public.admin_cancel_invite(text),
  public.admin_update_staff(uuid, public.staff_role, boolean), public.admin_export_orders(date, date)
  to authenticated;
grant execute on function public.staff_login_allowed(text, text) to service_role;
