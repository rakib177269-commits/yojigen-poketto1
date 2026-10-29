-- 0018 Marketing events (phase 6).
-- Purchase is reported ONLY by the server, ONLY for orders an operator confirmed
-- (marketing_status = 'confirmed'), by a pg_cron sweep every 10 minutes. Meta's
-- send is stamped in capi_sent_at; Google/TikTok in marketing_sent. A claim (with
-- attempts) stops two sweeps sending the same order; event ids are the order code,
-- so the vendors drop any accidental repeat as a duplicate.

alter table public.orders
  add column marketing_sent jsonb not null default '{}'::jsonb;

-- Tracking ids (public by nature: they appear in every page's HTML).
create function public.admin_update_tracking_settings(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_meta text := nullif(btrim(coalesce(p->>'meta_pixel_id', '')), '');
  v_ga4 text := upper(nullif(btrim(coalesce(p->>'ga4_id', '')), ''));
  v_tiktok text := upper(nullif(btrim(coalesce(p->>'tiktok_pixel_id', '')), ''));
begin
  perform private.require_role('admin');
  if v_meta is not null and v_meta !~ '^[0-9]{6,20}$' then
    raise exception using errcode = 'P0001', message = 'invalid_meta_pixel';
  end if;
  if v_ga4 is not null and v_ga4 !~ '^G-[A-Z0-9]{4,15}$' then
    raise exception using errcode = 'P0001', message = 'invalid_ga4_id';
  end if;
  if v_tiktok is not null and v_tiktok !~ '^[A-Z0-9]{10,30}$' then
    raise exception using errcode = 'P0001', message = 'invalid_tiktok_pixel';
  end if;
  update public.store_settings set integrations = jsonb_set(coalesce(integrations, '{}'::jsonb), '{tracking}',
    jsonb_build_object('meta_pixel_id', v_meta, 'ga4_id', v_ga4, 'tiktok_pixel_id', v_tiktok))
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Orders whose Purchase still has to go to at least one of p_vendors ('meta', 'ga4', 'tiktok').
-- Vendors accept events up to 7 days old, so orders confirmed more than 6 days ago are left alone.
create function public.marketing_claim_orders(p_vendors text[], p_limit integer default 25) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids from (
    select o.id from public.orders o
    where o.marketing_status = 'confirmed'
      and o.status in ('confirmed', 'dispatched', 'delivered')
      and o.confirmed_at > now() - interval '6 days'
      and o.capi_attempts < 5
      and (o.capi_claimed_at is null or o.capi_claimed_at < now() - interval '10 minutes')
      and exists (select 1 from unnest(p_vendors) v
                  where (v = 'meta' and o.capi_sent_at is null)
                     or (v <> 'meta' and not (o.marketing_sent ? v)))
    order by o.confirmed_at
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked) c;
  if v_ids is null then
    return '[]'::jsonb;
  end if;
  update public.orders set capi_claimed_at = now(), capi_attempts = capi_attempts + 1 where id = any(v_ids);
  return (select jsonb_agg(jsonb_build_object(
      'id', o.id, 'code', o.code, 'total', o.total, 'delivery_fee', o.delivery_fee, 'discount', o.discount,
      'name', o.name, 'phone', o.phone, 'email', o.email, 'zone_code', o.zone_code,
      'fbp', o.fbp, 'fbc', o.fbc, 'client_ip', host(o.client_ip), 'client_user_agent', o.client_user_agent,
      'landing_url', o.landing_url, 'utm', o.utm, 'created_at', o.created_at, 'confirmed_at', o.confirmed_at,
      'sent', jsonb_strip_nulls(o.marketing_sent || jsonb_build_object('meta', o.capi_sent_at)),
      'items', (select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'title', i.title, 'variant_name', i.variant_name,
                                                    'quantity', i.quantity, 'unit_price', i.unit_price))
                from public.order_items i where i.order_id = o.id)))
    from public.orders o where o.id = any(v_ids));
end $$;

-- Record what happened per vendor and release the claim.
-- p_results: {"meta": {"ok": true}, "ga4": {"ok": false, "error": "..."}}
create function public.marketing_finish_order(p_order_id uuid, p_results jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_vendor text;
  v_result jsonb;
  v_errors text := null;
begin
  for v_vendor, v_result in select key, value from jsonb_each(coalesce(p_results, '{}'::jsonb)) loop
    if (v_result->>'ok')::boolean then
      if v_vendor = 'meta' then
        update public.orders set capi_sent_at = coalesce(capi_sent_at, now()) where id = p_order_id;
      else
        update public.orders set marketing_sent = marketing_sent || jsonb_build_object(v_vendor, now())
        where id = p_order_id and not (marketing_sent ? v_vendor);
      end if;
    else
      v_errors := concat_ws('; ', v_errors, v_vendor || ': ' || left(coalesce(v_result->>'error', 'failed'), 200));
    end if;
  end loop;
  update public.orders set capi_claimed_at = null, capi_last_error = left(v_errors, 600) where id = p_order_id;
end $$;

-- Generic rate limit for server routes (e.g. the browser-event mirror).
create function public.rate_limit_hit(p_key text, p_max integer, p_seconds integer) returns boolean
language sql volatile security definer set search_path = '' as $$
  select private.hit_rate_limit(p_key, p_max, make_interval(secs => p_seconds))
$$;

grant execute on function public.admin_update_tracking_settings(jsonb) to authenticated;
grant execute on function public.marketing_claim_orders(text[], integer), public.marketing_finish_order(uuid, jsonb),
  public.rate_limit_hit(text, integer, integer) to service_role;

select cron.schedule('marketing-purchase-sweep', '*/10 * * * *', $$select private.call_sweep('/api/sweep/marketing')$$);
