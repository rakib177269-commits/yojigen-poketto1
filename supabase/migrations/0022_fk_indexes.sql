-- 0022 Indexes for foreign keys the Supabase performance advisor flagged.
-- Mostly matters for deletes/joins as the shop grows (e.g. a customer's orders
-- on /account, removing a product that old orders mention).
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_coupon_idx on public.orders (coupon_id);
create index if not exists orders_zone_idx on public.orders (zone_code);
create index if not exists orders_confirmed_by_idx on public.orders (confirmed_by);
create index if not exists order_items_product_idx on public.order_items (product_id);
create index if not exists order_items_variant_idx on public.order_items (variant_id);
create index if not exists order_events_actor_idx on public.order_events (actor_id);
create index if not exists product_images_variant_idx on public.product_images (variant_id);
create index if not exists customer_addresses_customer_idx on public.customer_addresses (customer_id);
create index if not exists abandoned_carts_contacted_by_idx on public.abandoned_carts (contacted_by);
create index if not exists abandoned_carts_recovered_order_idx on public.abandoned_carts (recovered_order_id);
create index if not exists staff_invites_invited_by_idx on private.staff_invites (invited_by);
create index if not exists staff_invites_claimed_by_idx on private.staff_invites (claimed_by);
