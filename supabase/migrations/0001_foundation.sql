-- 0001 Foundation: extensions, schemas, enums, core tables, RLS, privileges.
--
-- Security model (see ARCHITECTURE.md):
--   * RLS is enabled on every table.
--   * The browser (anon key) may only SELECT active products, their variants and
--     images, active categories and live banners. Nothing else.
--   * No role used by a browser can INSERT/UPDATE/DELETE any table directly.
--     Every write goes through a SECURITY DEFINER function with an explicit grant.
--   * Internal helpers live in the `private` schema, which PostgREST does not expose.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default.
-- Turn that off: every function must be granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
-- Same for tables: browsers get nothing unless granted below.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------- enums
create type public.product_status as enum ('draft', 'active', 'hidden', 'archived');
create type public.order_status as enum ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled', 'returned');
create type public.marketing_status as enum ('pending', 'confirmed', 'rejected');
create type public.staff_role as enum ('admin', 'manager', 'support', 'packer');
create type public.coupon_type as enum ('percent', 'fixed', 'free_shipping');

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- settings
-- Single row. Non-secret store configuration. Secrets never live here.
create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  maintenance_mode boolean not null default false,
  -- Orders whose (subtotal - coupon discount) reaches this get free delivery. NULL = off.
  free_shipping_threshold integer check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  order_sms_enabled boolean not null default false,
  -- Public, non-secret integration settings (pixel IDs, on/off toggles).
  integrations jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.store_settings (free_shipping_threshold) values (2000);

-- ---------------------------------------------------------------- catalogue
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status public.product_status not null default 'draft',
  price integer not null check (price >= 0),               -- whole taka
  compare_at_price integer check (compare_at_price is null or compare_at_price >= 0),
  stock integer not null default 0 check (stock >= 0),     -- used when the product has no variants
  category_id uuid references public.categories (id) on delete set null,
  tags text[] not null default '{}',
  description_html text not null default '',              -- sanitised on save
  seo_title text,
  seo_description text,
  sold_count integer not null default 0,                   -- incremented when an order is confirmed
  is_sample boolean not null default false,                -- seed data; removed before launch
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_status_created_idx on public.products (status, created_at desc);
create index products_category_idx on public.products (category_id);
create index products_title_trgm_idx on public.products using gin (title extensions.gin_trgm_ops);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),     -- e.g. "Sky Blue"
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9a-fA-F]{6}$'),
  stock integer not null default 0 check (stock >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);
create index product_variants_product_idx on public.product_variants (product_id);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  -- Storage key prefix in the product-images bucket ("products/<pid>/<id>"),
  -- or a site path starting with "/" for bundled sample images.
  storage_key text not null,
  widths integer[] not null default '{}',                  -- generated WebP widths
  width integer,
  height integer,
  alt text not null default '',
  variant_id uuid references public.product_variants (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  subtitle text,
  cta_label text,
  link_url text,
  desktop_key text not null,
  desktop_widths integer[] not null default '{}',
  desktop_width integer,
  desktop_height integer,
  mobile_key text not null,
  mobile_widths integer[] not null default '{}',
  mobile_width integer,
  mobile_height integer,
  alt text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- delivery
-- Keywords are matched (substring, after loose normalisation) against the
-- customer's free-text address. Lower match_priority is checked first, so
-- outskirts ("সাভার, ঢাকা") win over the city, and named districts outside
-- Dhaka win over the bare word "Dhaka".
create table public.delivery_zones (
  code text primary key check (code ~ '^[a-z_]+$'),
  name text not null,
  fee integer not null check (fee >= 0),
  eta_text text,
  match_priority integer not null,
  keywords text[] not null default '{}',
  is_default boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index delivery_zones_one_default on public.delivery_zones (is_default) where is_default;

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),   -- stored upper-case
  type public.coupon_type not null,
  value integer not null default 0 check (value >= 0),     -- percent (1-100) or taka
  max_discount integer check (max_discount is null or max_discount > 0),  -- cap for percent coupons
  min_order integer not null default 0 check (min_order >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  used_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'percent' or value between 1 and 100)
);

-- ---------------------------------------------------------------- customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text unique check (phone is null or phone ~ '^8801[3-9][0-9]{8}$'),
  email text unique check (email = lower(email)),
  name text,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  label text,
  name text not null,
  phone text not null check (phone ~ '^8801[3-9][0-9]{8}$'),
  address text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid references public.customers (id) on delete set null,
  status public.order_status not null default 'pending',
  marketing_status public.marketing_status not null default 'pending',
  source text not null default 'web' check (source in ('web', 'manual')),
  name text not null,
  phone text not null check (phone ~ '^8801[3-9][0-9]{8}$'),
  email text check (email = lower(email)),
  address text not null,
  zone_code text not null references public.delivery_zones (code),
  note text,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  delivery_fee_original integer not null check (delivery_fee_original >= 0),
  total integer not null check (total >= 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  payment_method text not null default 'cod',
  -- Captured at checkout for server-side conversion events sent after confirmation.
  fbp text,
  fbc text,
  client_ip inet,
  client_user_agent text,
  landing_url text,
  utm jsonb,
  -- Conversions API Purchase: claimed by the sweep, stamped once when sent.
  capi_claimed_at timestamptz,
  capi_sent_at timestamptz,
  capi_attempts integer not null default 0,
  capi_last_error text,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  rejected_reason text,
  courier_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_phone_idx on public.orders (phone);
create index orders_capi_pending_idx on public.orders (confirmed_at)
  where marketing_status = 'confirmed' and capi_sent_at is null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  title text not null,
  variant_name text,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total integer not null check (line_total >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- Timeline shown to the customer (public = true) and the operator (all rows).
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('status', 'courier', 'note', 'edit')),
  status public.order_status,
  label text not null,
  detail jsonb,
  source text not null default 'system' check (source in ('system', 'customer', 'operator', 'courier')),
  actor_id uuid references auth.users (id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------- marketing
create table public.abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^8801[3-9][0-9]{8}$'),
  name text,
  address text,
  items jsonb not null,           -- re-priced from the catalogue at capture time
  subtotal integer not null,
  status text not null default 'open' check (status in ('open', 'contacted', 'recovered', 'dismissed')),
  recovered_order_id uuid references public.orders (id) on delete set null,
  contacted_at timestamptz,
  contacted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index abandoned_carts_one_open_per_phone on public.abandoned_carts (phone)
  where status in ('open', 'contacted');

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

-- ---------------------------------------------------------------- staff + audit
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (email = lower(email)),
  name text,
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  action text not null,           -- INSERT / UPDATE / DELETE or a named action
  table_name text,
  row_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_table_row_idx on public.audit_log (table_name, row_id, created_at desc);

-- ---------------------------------------------------------------- private
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

-- ---------------------------------------------------------------- triggers
create trigger touch before update on public.store_settings for each row execute function private.touch_updated_at();
create trigger touch before update on public.categories for each row execute function private.touch_updated_at();
create trigger touch before update on public.products for each row execute function private.touch_updated_at();
create trigger touch before update on public.product_variants for each row execute function private.touch_updated_at();
create trigger touch before update on public.banners for each row execute function private.touch_updated_at();
create trigger touch before update on public.delivery_zones for each row execute function private.touch_updated_at();
create trigger touch before update on public.coupons for each row execute function private.touch_updated_at();
create trigger touch before update on public.customers for each row execute function private.touch_updated_at();
create trigger touch before update on public.orders for each row execute function private.touch_updated_at();
create trigger touch before update on public.abandoned_carts for each row execute function private.touch_updated_at();
create trigger touch before update on public.staff for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.store_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;
alter table public.banners enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.coupons enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.abandoned_carts enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.staff enable row level security;
alter table public.audit_log enable row level security;
alter table private.rate_limits enable row level security;

-- Browsers: read-only, active catalogue only.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.categories, public.products, public.product_variants,
  public.product_images, public.banners to anon, authenticated;

create policy "public reads active categories" on public.categories
  for select to anon, authenticated using (is_active);

create policy "public reads active products" on public.products
  for select to anon, authenticated using (status = 'active');

create policy "public reads variants of active products" on public.product_variants
  for select to anon, authenticated
  using (is_active and exists (
    select 1 from public.products p where p.id = product_id and p.status = 'active'));

create policy "public reads images of active products" on public.product_images
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p where p.id = product_id and p.status = 'active'));

create policy "public reads live banners" on public.banners
  for select to anon, authenticated
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
