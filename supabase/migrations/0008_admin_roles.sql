-- 0008 Admin panel (1/3): staff roles, staff read access (RLS) and the audit
-- trail. 0009 adds the operator functions, 0010 order editing.
--
-- Roles are enforced HERE, not just in the UI:
--   admin    everything, incl. team, settings, CSV export, audit log
--   manager  orders, abandoned carts, (catalogue and coupons in phase 4)
--   support  orders, abandoned carts, customer check
--   packer   sees confirmed/dispatched orders only; can mark them dispatched
-- Every operator write is recorded in audit_log (who, what, when, before/after).

-- ---------------------------------------------------------------- role helpers
create table private.staff_invites (
  email text primary key check (email = lower(email)),
  role public.staff_role not null,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- An invite is pending until it is claimed (first verified sign-in) or cancelled.
  -- Rows are kept as a record rather than deleted.
  claimed_at timestamptz,
  claimed_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz
);
alter table private.staff_invites enable row level security;

-- The owner's account. They become admin the first time they sign in with this
-- verified email address.
insert into private.staff_invites (email, role) values ('yujigenpoketto@gmail.com', 'admin');

create function private.staff_role() returns public.staff_role
language sql stable security definer set search_path = '' as $$
  select s.role from public.staff s where s.user_id = auth.uid() and s.is_active
$$;

create function private.has_role(variadic roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.staff_role() = any (roles), false)
$$;

create function private.require_role(variadic roles public.staff_role[]) returns public.staff_role
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.staff_role := private.staff_role();
begin
  if r is null or not (r = any (roles)) then
    raise exception using errcode = '42501', message = 'not_allowed';
  end if;
  return r;
end $$;

-- RLS policies call these as the signed-in user, so that role needs them.
-- (PostgREST does not expose the private schema; tables in it stay ungranted.)
grant usage on schema private to authenticated;
grant execute on function private.staff_role() to authenticated;
grant execute on function private.has_role(public.staff_role[]) to authenticated;

-- ---------------------------------------------------------------- staff read access
grant select on public.orders, public.order_items, public.order_events, public.customers,
  public.abandoned_carts, public.audit_log, public.staff, public.coupons, public.store_settings,
  public.delivery_zones, public.newsletter_subscribers to authenticated;

create policy "staff read orders" on public.orders for select to authenticated
  using (private.has_role('admin', 'manager', 'support')
         or (private.has_role('packer') and status in ('confirmed', 'dispatched')));
-- Items and events follow the visibility of their order.
create policy "staff read order items" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "staff read order events" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "staff read customers" on public.customers for select to authenticated
  using (private.has_role('admin', 'manager', 'support'));
create policy "staff read abandoned carts" on public.abandoned_carts for select to authenticated
  using (private.has_role('admin', 'manager', 'support'));
create policy "admins read audit log" on public.audit_log for select to authenticated
  using (private.has_role('admin'));
create policy "staff read own row, admins read team" on public.staff for select to authenticated
  using (user_id = auth.uid() or private.has_role('admin'));
create policy "managers read coupons" on public.coupons for select to authenticated
  using (private.has_role('admin', 'manager'));
create policy "staff read settings" on public.store_settings for select to authenticated
  using (private.staff_role() is not null);
create policy "staff read delivery zones" on public.delivery_zones for select to authenticated
  using (private.staff_role() is not null);
create policy "managers read subscribers" on public.newsletter_subscribers for select to authenticated
  using (private.has_role('admin', 'manager'));
-- Staff also see drafts/hidden items (in addition to the public "active only" policies).
create policy "staff read all products" on public.products for select to authenticated
  using (private.staff_role() is not null);
create policy "staff read all variants" on public.product_variants for select to authenticated
  using (private.staff_role() is not null);
create policy "staff read all images" on public.product_images for select to authenticated
  using (private.staff_role() is not null);
create policy "staff read all categories" on public.categories for select to authenticated
  using (private.staff_role() is not null);
create policy "staff read all banners" on public.banners for select to authenticated
  using (private.staff_role() is not null);

-- ---------------------------------------------------------------- audit trail
-- Records every write made by a signed-in user. Customer orders (placed through
-- the service role, no user) are not "operator writes" and are skipped.
create function private.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;
  insert into public.audit_log (actor_id, actor_role, action, table_name, row_id, before, after)
  values (auth.uid(), private.staff_role()::text, tg_op, tg_table_schema || '.' || tg_table_name,
          coalesce(v_new, v_old) ->> coalesce(nullif(tg_argv[0], ''), 'id'), v_old, v_new);
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on public.orders for each row execute function private.audit();
create trigger audit after insert or update or delete on public.order_items for each row execute function private.audit();
create trigger audit after insert or update or delete on public.products for each row execute function private.audit();
create trigger audit after insert or update or delete on public.product_variants for each row execute function private.audit();
create trigger audit after insert or update or delete on public.product_images for each row execute function private.audit();
create trigger audit after insert or update or delete on public.categories for each row execute function private.audit();
create trigger audit after insert or update or delete on public.banners for each row execute function private.audit();
create trigger audit after insert or update or delete on public.coupons for each row execute function private.audit();
create trigger audit after insert or update or delete on public.delivery_zones for each row execute function private.audit('code');
create trigger audit after insert or update or delete on public.store_settings for each row execute function private.audit();
create trigger audit after insert or update or delete on public.staff for each row execute function private.audit('user_id');
create trigger audit after insert or update or delete on public.abandoned_carts for each row execute function private.audit();
create trigger audit after insert or update or delete on private.staff_invites for each row execute function private.audit('email');
