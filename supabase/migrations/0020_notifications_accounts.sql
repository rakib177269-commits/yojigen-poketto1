-- 0020 Customer messages (SMS + email) and customer accounts (phone + SMS code).
--
-- Messages: an outbox. A trigger on orders queues one row per (order, channel,
-- kind) – the unique key makes queuing idempotent – and the server sends them
-- (right away, plus a pg_cron retry sweep). Which events send what is set in
-- store_settings.integrations->'notifications'.
--
-- Accounts: a 6-digit code sent by SMS, stored only as a hash, valid 5 minutes,
-- 5 tries; requests are rate limited per phone and per visitor. After a correct
-- code the server signs a session cookie with a secret kept in Vault.

-- ---------------------------------------------------------------- outbox
create table private.notifications (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders (id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  kind text not null,
  recipient text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (order_id, channel, kind)
);
create index notifications_pending_idx on private.notifications (created_at) where status = 'pending';

-- Defaults when the owner hasn't changed anything: SMS costs money, email doesn't.
create function private.notify_wanted(p_channel text, p_kind text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(
    (select (s.integrations->'notifications'->p_channel->>p_kind)::boolean from public.store_settings s where s.id = 1),
    case p_channel
      when 'sms' then p_kind in ('confirmed', 'dispatched')
      else p_kind in ('placed', 'confirmed', 'dispatched', 'delivered', 'cancelled', 'staff_new_order')
    end)
$$;

create function private.queue_order_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_staff text;
begin
  if tg_op = 'INSERT' then
    v_kind := 'placed';
    select nullif(btrim(coalesce(integrations->'notifications'->>'staff_email', '')), '') into v_staff
    from public.store_settings where id = 1;
    if v_staff is not null and private.notify_wanted('email', 'staff_new_order') then
      insert into private.notifications (order_id, channel, kind, recipient)
      values (new.id, 'email', 'staff_new_order', v_staff) on conflict do nothing;
    end if;
  elsif new.status is distinct from old.status then
    v_kind := case new.status
      when 'confirmed' then 'confirmed'
      when 'dispatched' then 'dispatched'
      when 'delivered' then 'delivered'
      -- a rejected (fake) order gets no message; a real cancellation does
      when 'cancelled' then case when new.marketing_status = 'rejected' then null else 'cancelled' end
    end;
  end if;
  if v_kind is null then
    return new;
  end if;
  if private.notify_wanted('sms', v_kind) then
    insert into private.notifications (order_id, channel, kind, recipient)
    values (new.id, 'sms', v_kind, new.phone) on conflict do nothing;
  end if;
  if new.email is not null and private.notify_wanted('email', v_kind) then
    insert into private.notifications (order_id, channel, kind, recipient)
    values (new.id, 'email', v_kind, new.email) on conflict do nothing;
  end if;
  return new;
end $$;

create trigger queue_notifications after insert or update of status on public.orders
  for each row execute function private.queue_order_notifications();

-- Server: claim messages to send (all pending, or one order's right after a change).
create function public.notify_claim(p_limit integer default 50, p_order_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ids bigint[];
begin
  select array_agg(id) into v_ids from (
    select n.id from private.notifications n
    where n.status = 'pending' and n.attempts < 5
      and (n.claimed_at is null or n.claimed_at < now() - interval '5 minutes')
      and (p_order_id is null or n.order_id = p_order_id)
    order by n.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked) c;
  if v_ids is null then
    return '[]'::jsonb;
  end if;
  update private.notifications set claimed_at = now(), attempts = attempts + 1 where id = any(v_ids);
  return (select jsonb_agg(jsonb_build_object(
      'id', n.id, 'channel', n.channel, 'kind', n.kind, 'recipient', n.recipient,
      'order', private.order_public_json(n.order_id) || jsonb_build_object(
        'name', o.name, 'address', o.address, 'phone', o.phone, 'note', o.note,
        'consignment_id', o.courier_consignment_id)) order by n.id)
    from private.notifications n join public.orders o on o.id = n.order_id
    where n.id = any(v_ids));
end $$;

create function public.notify_finish(p_id bigint, p_status text, p_error text default null) returns void
language sql volatile security definer set search_path = '' as $$
  update private.notifications set
    status = case
      when p_status in ('sent', 'skipped') then p_status
      when attempts >= 5 then 'failed'
      else 'pending' end,
    last_error = left(p_error, 300), claimed_at = null,
    sent_at = case when p_status = 'sent' then now() else sent_at end
  where id = p_id
$$;

-- Staff: messages for one order (order page).
create function public.admin_order_notifications(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager', 'support');
  return coalesce((select jsonb_agg(jsonb_build_object('channel', channel, 'kind', kind, 'status', status,
      'attempts', attempts, 'last_error', last_error, 'created_at', created_at, 'sent_at', sent_at) order by id)
    from private.notifications where order_id = p_order_id), '[]'::jsonb);
end $$;

create function public.admin_update_notification_settings(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_staff text := lower(nullif(btrim(coalesce(p->>'staff_email', '')), ''));
  v_kinds text[] := array['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'];
  v_sms jsonb := '{}'::jsonb;
  v_email jsonb := '{}'::jsonb;
  k text;
begin
  perform private.require_role('admin');
  if v_staff is not null and v_staff !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode = 'P0001', message = 'invalid_email';
  end if;
  foreach k in array v_kinds loop
    v_sms := v_sms || jsonb_build_object(k, coalesce((p->'sms'->>k)::boolean, false));
    v_email := v_email || jsonb_build_object(k, coalesce((p->'email'->>k)::boolean, false));
  end loop;
  v_email := v_email || jsonb_build_object('staff_new_order', v_staff is not null);
  update public.store_settings set integrations = jsonb_set(coalesce(integrations, '{}'::jsonb), '{notifications}',
    jsonb_build_object('sms', v_sms, 'email', v_email, 'staff_email', v_staff))
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- sign-in codes
create table private.otp_codes (
  phone text primary key,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Server only. Returns the code so the server can SMS it; it is never stored in clear.
create function public.otp_request(p_phone text, p_client_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_phone text := private.normalize_bd_phone(p_phone);
  v_code text;
begin
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if not private.hit_rate_limit('otp-phone:' || v_phone, 3, interval '15 minutes')
     or not private.hit_rate_limit('otp-client:' || coalesce(p_client_key, '?'), 10, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint & 2147483647) % 1000000)::text, 6, '0');
  insert into private.otp_codes (phone, code_hash, expires_at)
  values (v_phone, encode(extensions.digest(v_phone || ':' || v_code, 'sha256'), 'hex'), now() + interval '5 minutes')
  on conflict (phone) do update set code_hash = excluded.code_hash, attempts = 0,
    expires_at = excluded.expires_at, created_at = now();
  return jsonb_build_object('ok', true, 'phone', v_phone, 'code', v_code);
end $$;

-- Server only. On success returns the customer (created on first sign-in).
create function public.otp_verify(p_phone text, p_code text, p_client_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_phone text := private.normalize_bd_phone(p_phone);
  v_code text := private.bn_digits(btrim(coalesce(p_code, '')));
  r private.otp_codes;
  v_customer uuid;
begin
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if not private.hit_rate_limit('otp-verify:' || coalesce(p_client_key, '?'), 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  select * into r from private.otp_codes where phone = v_phone for update;
  if r.phone is null or r.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;
  if r.attempts >= 5 then
    delete from private.otp_codes where phone = v_phone;
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  if r.code_hash <> encode(extensions.digest(v_phone || ':' || v_code, 'sha256'), 'hex') then
    update private.otp_codes set attempts = attempts + 1 where phone = v_phone;
    return jsonb_build_object('ok', false, 'error', 'wrong_code');
  end if;
  delete from private.otp_codes where phone = v_phone;
  insert into public.customers (phone) values (v_phone) on conflict (phone) do nothing;
  select id into v_customer from public.customers where phone = v_phone;
  return jsonb_build_object('ok', true, 'customer_id', v_customer, 'phone', v_phone);
end $$;

-- Session cookies are signed with this (server only, like the sweep secret).
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'customer_session_secret',
  'Signs customer session cookies (yp_session). Rotating it signs everyone out.');

create function public.get_customer_session_secret() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'customer_session_secret'
$$;

-- ---------------------------------------------------------------- account (server only, after the cookie is verified)
create function public.customer_account(p_customer_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'phone', c.phone, 'name', c.name, 'email', c.email,
    'orders', coalesce((select jsonb_agg(jsonb_build_object('code', o.code, 'status', o.status, 'total', o.total,
                          'created_at', o.created_at, 'courier_status', o.courier_status,
                          'items', (select sum(quantity) from public.order_items i where i.order_id = o.id))
                        order by o.created_at desc)
                        from (select * from public.orders o
                              where (o.customer_id = c.id or o.phone = c.phone) and o.marketing_status <> 'rejected'
                              order by o.created_at desc limit 50) o), '[]'::jsonb),
    'last_address', (select jsonb_build_object('name', o.name, 'address', o.address, 'email', o.email)
                     from public.orders o where o.customer_id = c.id or o.phone = c.phone
                     order by o.created_at desc limit 1))
  from public.customers c where c.id = p_customer_id
$$;

create function public.customer_update_profile(p_customer_id uuid, p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_name text := nullif(btrim(coalesce(p->>'name', '')), '');
  v_email text := lower(nullif(btrim(coalesce(p->>'email', '')), ''));
begin
  if v_name is not null and char_length(v_name) not between 2 and 80 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254) then
    raise exception using errcode = 'P0001', message = 'invalid_email';
  end if;
  if v_email is not null and exists (select 1 from public.customers where email = v_email and id <> p_customer_id) then
    raise exception using errcode = 'P0001', message = 'email_taken';
  end if;
  update public.customers set name = v_name, email = v_email where id = p_customer_id;
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------------- grants + schedule
grant execute on function public.notify_claim(integer, uuid), public.notify_finish(bigint, text, text),
  public.otp_request(text, text), public.otp_verify(text, text, text), public.get_customer_session_secret(),
  public.customer_account(uuid), public.customer_update_profile(uuid, jsonb) to service_role;
grant execute on function public.admin_order_notifications(uuid), public.admin_update_notification_settings(jsonb)
  to authenticated;

select cron.schedule('notify-sweep', '*/5 * * * *', $$select private.call_sweep('/api/sweep/notify')$$);
