-- 0016 Pathao courier.
-- Booking: the server claims the order (a short lock so two clicks can't book twice),
-- calls Pathao with the secret API keys, then records the consignment. Pathao's
-- webhook then reports progress; every event is stored once (safe to receive twice)
-- and drives delivered / returned automatically.

alter table public.orders
  add column courier_consignment_id text unique,
  add column courier_fee integer check (courier_fee >= 0),
  add column courier_booked_at timestamptz,
  add column courier_lock_at timestamptz,
  add column courier_updated_at timestamptz;

-- Pathao access token, shared by every server function (they are stateless).
create table private.courier_tokens (
  provider text primary key,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Every webhook delivery, once. dedupe_key = hash of the exact payload.
create table private.courier_events (
  id bigint generated always as identity primary key,
  provider text not null,
  dedupe_key text not null unique,
  event text,
  consignment_id text,
  order_id uuid references public.orders (id) on delete set null,
  outcome text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index courier_events_order_idx on private.courier_events (order_id);

-- Pathao's delivery history per phone, cached for a day (it's a paid-for lookup on their side).
create table private.courier_customer_cache (
  phone text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- tokens (server only)
create function public.courier_get_token(p_provider text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('access_token', access_token, 'refresh_token', refresh_token, 'expires_at', expires_at)
  from private.courier_tokens where provider = p_provider
$$;

create function public.courier_save_token(p_provider text, p_access text, p_refresh text, p_expires_in integer) returns void
language sql volatile security definer set search_path = '' as $$
  insert into private.courier_tokens (provider, access_token, refresh_token, expires_at)
  values (p_provider, p_access, p_refresh, now() + make_interval(secs => greatest(coalesce(p_expires_in, 3600), 60)))
  on conflict (provider) do update set access_token = excluded.access_token,
    refresh_token = coalesce(excluded.refresh_token, private.courier_tokens.refresh_token),
    expires_at = excluded.expires_at, updated_at = now()
$$;

create function public.courier_customer_cache_get(p_phone text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select data || jsonb_build_object('fetched_at', fetched_at) from private.courier_customer_cache
  where phone = private.normalize_bd_phone(p_phone) and fetched_at > now() - interval '1 day'
$$;

create function public.courier_customer_cache_put(p_phone text, p_data jsonb) returns void
language sql volatile security definer set search_path = '' as $$
  insert into private.courier_customer_cache (phone, data) values (private.normalize_bd_phone(p_phone), p_data)
  on conflict (phone) do update set data = excluded.data, fetched_at = now()
$$;

-- ---------------------------------------------------------------- settings
-- Non-secret Pathao settings live in store_settings.integrations->'pathao'.
create function public.admin_update_courier_settings(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_store integer := private.int_or_null(p->>'store_id');
  v_weight numeric;
begin
  perform private.require_role('admin');
  if nullif(btrim(coalesce(p->>'store_id', '')), '') is not null and (v_store is null or v_store <= 0) then
    raise exception using errcode = 'P0001', message = 'invalid_store_id';
  end if;
  begin
    v_weight := coalesce(nullif(btrim(coalesce(p->>'default_weight', '')), '')::numeric, 0.5);
  exception when others then
    raise exception using errcode = 'P0001', message = 'invalid_weight';
  end;
  if v_weight < 0.1 or v_weight > 10 then
    raise exception using errcode = 'P0001', message = 'invalid_weight';
  end if;
  update public.store_settings set integrations = jsonb_set(coalesce(integrations, '{}'::jsonb), '{pathao}',
    jsonb_build_object('store_id', v_store, 'default_weight', v_weight,
                       'instruction', left(nullif(btrim(coalesce(p->>'instruction', '')), ''), 200)))
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- booking
-- Step 1: claim. Returns what the server needs to book the parcel.
create function public.admin_courier_claim(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
  v_cfg jsonb;
begin
  perform private.require_role('admin', 'manager', 'support', 'packer');
  o := private.lock_order(p_order_id);
  if o.courier_consignment_id is not null then
    raise exception using errcode = 'P0001', message = 'already_booked';
  end if;
  if o.status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'not_confirmed';
  end if;
  if o.courier_lock_at is not null and o.courier_lock_at > now() - interval '2 minutes' then
    raise exception using errcode = 'P0001', message = 'booking_in_progress';
  end if;
  select integrations->'pathao' into v_cfg from public.store_settings where id = 1;
  if (v_cfg->>'store_id') is null then
    raise exception using errcode = 'P0001', message = 'courier_not_configured';
  end if;
  update public.orders set courier_lock_at = now() where id = p_order_id;
  return jsonb_build_object(
    'id', o.id, 'code', o.code, 'name', o.name, 'phone', substr(o.phone, 3),
    'address', o.address, 'note', o.note, 'amount_to_collect', o.total,
    'store_id', (v_cfg->>'store_id')::integer,
    'default_weight', coalesce((v_cfg->>'default_weight')::numeric, 0.5),
    'instruction', v_cfg->>'instruction',
    'quantity', (select coalesce(sum(quantity), 1) from public.order_items where order_id = o.id),
    'description', (select left(string_agg(i.quantity || '× ' || i.title || coalesce(' (' || i.variant_name || ')', ''), ', ' order by i.title), 250)
                    from public.order_items i where i.order_id = o.id));
end $$;

-- Step 2a: Pathao accepted. The order is now with the courier.
create function public.admin_courier_booked(p_order_id uuid, p_consignment_id text, p_fee integer, p_courier_status text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  o public.orders;
begin
  perform private.require_role('admin', 'manager', 'support', 'packer');
  o := private.lock_order(p_order_id);
  if o.courier_consignment_id is not null then
    raise exception using errcode = 'P0001', message = 'already_booked';
  end if;
  if o.courier_lock_at is null or nullif(btrim(coalesce(p_consignment_id, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'invalid_transition';
  end if;
  update public.orders set courier_consignment_id = btrim(p_consignment_id), courier_fee = p_fee,
    courier_booked_at = now(), courier_lock_at = null, courier_updated_at = now(),
    courier_status = coalesce(nullif(btrim(coalesce(p_courier_status, '')), ''), 'Pending'),
    status = case when status = 'confirmed' then 'dispatched'::public.order_status else status end
  where id = p_order_id;
  insert into public.order_events (order_id, kind, status, label, detail, source, actor_id)
  values (p_order_id, 'courier', 'dispatched', 'Handed to Pathao courier',
          jsonb_build_object('consignment_id', btrim(p_consignment_id), 'fee', p_fee), 'operator', auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Step 2b: Pathao refused (or timed out). Release the lock and note why (staff only).
create function public.admin_courier_release(p_order_id uuid, p_error text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager', 'support', 'packer');
  perform private.lock_order(p_order_id);
  update public.orders set courier_lock_at = null where id = p_order_id and courier_consignment_id is null;
  insert into public.order_events (order_id, kind, label, detail, source, actor_id, is_public)
  values (p_order_id, 'courier', 'Pathao booking failed', jsonb_build_object('note', left(coalesce(p_error, ''), 500)),
          'operator', auth.uid(), false);
  return jsonb_build_object('ok', true);
end $$;

-- Manual refresh / status check from Pathao's order-info endpoint: text only, never a status change.
create function public.admin_courier_note_status(p_order_id uuid, p_courier_status text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager', 'support', 'packer');
  update public.orders set courier_status = left(nullif(btrim(coalesce(p_courier_status, '')), ''), 60),
    courier_updated_at = now()
  where id = p_order_id and courier_consignment_id is not null;
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------------- webhook (server only)
-- Pathao event -> (customer-facing?, label, our status). Unknown events are kept, internal.
create function private.courier_event_map(p_event text) returns jsonb
language sql immutable set search_path = '' as $$
  select case lower(coalesce(p_event, ''))
    when 'order.created'                    then '{"public":false,"label":"Pathao: order created"}'
    when 'order.updated'                    then '{"public":false,"label":"Pathao: order updated"}'
    when 'order.pickup-requested'           then '{"public":false,"label":"Pathao: pickup requested"}'
    when 'order.assigned-for-pickup'        then '{"public":false,"label":"Pathao: rider assigned for pickup"}'
    when 'order.picked'                     then '{"public":true,"label":"Picked up by Pathao"}'
    when 'order.pickup-failed'              then '{"public":false,"label":"Pathao: pickup failed"}'
    when 'order.pickup-cancelled'           then '{"public":false,"label":"Pathao: pickup cancelled"}'
    when 'order.at-the-sorting-hub'         then '{"public":true,"label":"At the Pathao sorting hub"}'
    when 'order.in-transit'                 then '{"public":true,"label":"On the way"}'
    when 'order.received-at-last-mile-hub'  then '{"public":true,"label":"Arrived at your local Pathao hub"}'
    when 'order.assigned-for-delivery'      then '{"public":true,"label":"Out for delivery"}'
    when 'order.delivered'                  then '{"public":true,"label":"Delivered","status":"delivered"}'
    when 'order.partial-delivery'           then '{"public":true,"label":"Partly delivered","status":"delivered","partial":true}'
    when 'order.delivery-failed'            then '{"public":true,"label":"Delivery attempt failed"}'
    when 'order.on-hold'                    then '{"public":false,"label":"Pathao: on hold"}'
    when 'order.returned'                   then '{"public":true,"label":"Returned to sender","status":"returned"}'
    when 'order.paid'                       then '{"public":false,"label":"Pathao paid out the cash collected"}'
    when 'order.paid-return'                then '{"public":false,"label":"Pathao: return charge settled"}'
    when 'order.exchanged'                  then '{"public":false,"label":"Pathao: exchanged"}'
    else jsonb_build_object('public', false, 'label', 'Pathao: ' || left(coalesce(p_event, 'unknown event'), 60))::text
  end::jsonb
$$;

create function public.courier_webhook(p_provider text, p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text := md5(p_payload::text);
  v_event text := p_payload->>'event';
  v_consignment text := nullif(btrim(coalesce(p_payload->>'consignment_id', '')), '');
  v_map jsonb := private.courier_event_map(v_event);
  v_order public.orders;
  v_event_id bigint;
  v_outcome text := 'recorded';
  v_detail jsonb;
begin
  insert into private.courier_events (provider, dedupe_key, event, consignment_id, payload)
  values (p_provider, v_key, v_event, v_consignment, p_payload)
  on conflict (dedupe_key) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    return jsonb_build_object('ok', true, 'outcome', 'duplicate');
  end if;

  select * into v_order from public.orders
  where (v_consignment is not null and courier_consignment_id = v_consignment)
     or (v_consignment is null and code = upper(btrim(coalesce(p_payload->>'merchant_order_id', ''))))
  for update;
  if v_order.id is null then
    update private.courier_events set outcome = 'no_matching_order' where id = v_event_id;
    return jsonb_build_object('ok', true, 'outcome', 'no_matching_order');
  end if;

  v_detail := jsonb_strip_nulls(jsonb_build_object(
    'event', v_event, 'consignment_id', v_consignment,
    'reason', nullif(p_payload->>'reason', ''),
    'collected_amount', p_payload->'collected_amount',
    'delivery_fee', p_payload->'delivery_fee',
    'at', coalesce(p_payload->>'updated_at', p_payload->>'timestamp')));

  update public.orders set courier_status = v_map->>'label', courier_updated_at = now() where id = v_order.id;

  if v_map->>'status' = 'delivered' and v_order.status = 'dispatched' then
    update public.orders set status = 'delivered' where id = v_order.id;
    v_outcome := 'delivered';
  elsif v_map->>'status' = 'returned' and v_order.status = 'dispatched' then
    update public.orders set status = 'returned' where id = v_order.id;
    perform private.restock_order(v_order.id);
    perform private.adjust_sold_count(v_order.id, -1);
    v_outcome := 'returned';
  end if;

  insert into public.order_events (order_id, kind, status, label, detail, source, is_public)
  values (v_order.id, 'courier',
          case when v_outcome in ('delivered', 'returned') then v_outcome::public.order_status end,
          v_map->>'label', v_detail, 'courier', (v_map->>'public')::boolean);
  if v_outcome = 'returned' then
    insert into public.order_events (order_id, kind, label, source, is_public)
    values (v_order.id, 'note', 'Items were put back in stock automatically. If anything came back damaged, lower its stock in Products.', 'system', false);
  elsif (v_map->>'partial')::boolean then
    insert into public.order_events (order_id, kind, label, detail, source, is_public)
    values (v_order.id, 'note', 'Partial delivery: check what the customer kept and what came back.',
            jsonb_build_object('collected_amount', p_payload->'collected_amount', 'order_total', v_order.total), 'system', false);
  end if;

  update private.courier_events set order_id = v_order.id, outcome = v_outcome where id = v_event_id;
  return jsonb_build_object('ok', true, 'outcome', v_outcome);
end $$;

-- ---------------------------------------------------------------- grants
grant execute on function public.courier_get_token(text), public.courier_save_token(text, text, text, integer),
  public.courier_customer_cache_get(text), public.courier_customer_cache_put(text, jsonb),
  public.courier_webhook(text, jsonb) to service_role;
grant execute on function public.admin_update_courier_settings(jsonb), public.admin_courier_claim(uuid),
  public.admin_courier_booked(uuid, text, integer, text), public.admin_courier_release(uuid, text),
  public.admin_courier_note_status(uuid, text) to authenticated;
