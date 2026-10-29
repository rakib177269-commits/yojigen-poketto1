-- 0012 Catalogue management (phase 4): products, variants, images, categories,
-- banners, coupons, bulk edit, spreadsheet import, image storage and the
-- nightly orphan-image sweep. Role checks live in each function:
--   admin + manager may change the catalogue; support and packer may not.
-- Removals that need DELETE (images, products, categories, banners, coupons)
-- are in 0013 so this file applies without a confirmation prompt.

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp'])
on conflict (id) do nothing;

-- Photo file names listed in an imported spreadsheet, waiting to be uploaded.
alter table public.products add column import_photo_files text[] not null default '{}';

-- Small non-secret runtime config for database jobs.
create table private.app_config (
  key text primary key,
  value text not null
);
alter table private.app_config enable row level security;
insert into private.app_config (key, value) values ('site_url', 'https://yojigen-poketto.netlify.app');

-- ---------------------------------------------------------------- helpers
create function private.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), ''), 'item')
$$;

create function private.unique_product_slug(p_base text, p_exclude uuid) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_base text := left(private.slugify(p_base), 70);
  v_slug text := v_base;
  n integer := 1;
begin
  while exists (select 1 from public.products where slug = v_slug and id is distinct from p_exclude) loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;
  return v_slug;
end $$;

create function private.int_or_null(p text) returns integer
language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p, '')) ~ '^[0-9]{1,7}$' then btrim(p)::integer end
$$;

create function private.text_array(p jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct v) filter (where v <> ''), '{}')
  from (
    select lower(btrim(x)) as v
    from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
    union all
    select lower(btrim(x))
    from regexp_split_to_table(case when jsonb_typeof(p) = 'string' then p #>> '{}' else '' end, ',') x
  ) t
$$;

-- Keys produced by /api/admin/upload: "<folder>/<uuid>/<uuid>".
create function private.valid_image_key(p text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p ~ '^(products|banners)/[0-9a-f-]{36}/[0-9a-f-]{36}$' or p ~ '^/sample/[a-z0-9-]+$', false)
$$;

create function private.int_widths(p jsonb) returns integer[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x::integer order by x::integer), '{}')
  from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
  where x ~ '^[0-9]{2,4}$'
$$;

-- ---------------------------------------------------------------- products
-- p: {id?, title, slug?, status, price, compare_at_price?, stock?, category_id?, tags,
--     description_html, seo_title?, seo_description?,
--     variants: [{id?, name, color_hex?, stock}],             (order = display order)
--     images:   [{id?, storage_key, widths, width, height, alt}]  (order = display order)}
-- Variants left out are deactivated (kept for order history). Images left out
-- are not removed here; see admin_remove_product_image in 0013.
create function public.admin_save_product(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p->>'id');
  v_title text := btrim(coalesce(p->>'title', ''));
  v_price integer := private.int_or_null(p->>'price');
  v_compare integer := private.int_or_null(p->>'compare_at_price');
  v_stock integer := coalesce(private.int_or_null(p->>'stock'), 0);
  v_status public.product_status;
  v_slug text;
  v_variant jsonb;
  v_image jsonb;
  v_keep uuid[] := '{}';
  v_vid uuid;
  i integer := 0;
begin
  perform private.require_role('admin', 'manager');
  if char_length(v_title) = 0 or char_length(v_title) > 140 then
    raise exception using errcode = 'P0001', message = 'invalid_title';
  end if;
  if v_price is null then
    raise exception using errcode = 'P0001', message = 'invalid_price';
  end if;
  if v_compare is not null and v_compare <= v_price then
    v_compare := null;  -- a "was" price that isn't higher is meaningless
  end if;
  begin
    v_status := coalesce(nullif(p->>'status', ''), 'draft')::public.product_status;
  exception when others then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end;
  if v_id is not null and not exists (select 1 from public.products where id = v_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  v_slug := private.unique_product_slug(coalesce(nullif(btrim(p->>'slug'), ''), v_title), v_id);

  if v_id is null then
    insert into public.products (title, slug, status, price, compare_at_price, stock, category_id, tags,
                                 description_html, seo_title, seo_description)
    values (v_title, v_slug, v_status, v_price, v_compare, v_stock, private.try_uuid(p->>'category_id'),
            private.text_array(p->'tags'), coalesce(p->>'description_html', ''),
            nullif(btrim(coalesce(p->>'seo_title', '')), ''), nullif(btrim(coalesce(p->>'seo_description', '')), ''))
    returning id into v_id;
  else
    update public.products set
      title = v_title, slug = v_slug, status = v_status, price = v_price, compare_at_price = v_compare,
      stock = v_stock, category_id = private.try_uuid(p->>'category_id'), tags = private.text_array(p->'tags'),
      description_html = coalesce(p->>'description_html', ''),
      seo_title = nullif(btrim(coalesce(p->>'seo_title', '')), ''),
      seo_description = nullif(btrim(coalesce(p->>'seo_description', '')), '')
    where id = v_id;
  end if;

  -- variants
  for v_variant in select value from jsonb_array_elements(coalesce(p->'variants', '[]'::jsonb)) loop
    i := i + 1;
    if char_length(btrim(coalesce(v_variant->>'name', ''))) = 0 then
      raise exception using errcode = 'P0001', message = 'invalid_variant';
    end if;
    if coalesce(v_variant->>'color_hex', '') <> '' and v_variant->>'color_hex' !~ '^#[0-9a-fA-F]{6}$' then
      raise exception using errcode = 'P0001', message = 'invalid_colour';
    end if;
    insert into public.product_variants (product_id, name, color_hex, stock, sort_order, is_active)
    values (v_id, btrim(v_variant->>'name'), nullif(v_variant->>'color_hex', ''),
            coalesce(private.int_or_null(v_variant->>'stock'), 0), i, true)
    on conflict (product_id, name) do update set
      color_hex = excluded.color_hex, stock = excluded.stock, sort_order = excluded.sort_order, is_active = true
    returning id into v_vid;
    v_keep := v_keep || v_vid;
  end loop;
  update public.product_variants set is_active = false
  where product_id = v_id and is_active and not (id = any (v_keep));

  -- images (order = position in the list)
  i := 0;
  for v_image in select value from jsonb_array_elements(coalesce(p->'images', '[]'::jsonb)) loop
    i := i + 1;
    if private.try_uuid(v_image->>'id') is not null then
      update public.product_images set sort_order = i, alt = left(coalesce(v_image->>'alt', ''), 200)
      where id = (v_image->>'id')::uuid and product_id = v_id;
    else
      if not private.valid_image_key(v_image->>'storage_key') then
        raise exception using errcode = 'P0001', message = 'invalid_image';
      end if;
      insert into public.product_images (product_id, storage_key, widths, width, height, alt, sort_order)
      values (v_id, v_image->>'storage_key', private.int_widths(v_image->'widths'),
              private.int_or_null(v_image->>'width'), private.int_or_null(v_image->>'height'),
              left(coalesce(v_image->>'alt', ''), 200), i);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'slug', v_slug);
end $$;

-- Bulk edit from the product list. p: {status?, price?, price_change_percent?, stock?}
-- Stock is only set on products without colour variants.
create function public.admin_bulk_update_products(p_ids uuid[], p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_pct integer;
  v_n integer;
begin
  perform private.require_role('admin', 'manager');
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'nothing_selected';
  end if;
  if coalesce(p->>'price_change_percent', '') <> '' then
    if p->>'price_change_percent' !~ '^-?[0-9]{1,2}$' then
      raise exception using errcode = 'P0001', message = 'invalid_percent';
    end if;
    v_pct := (p->>'price_change_percent')::integer;
  end if;
  update public.products set
    status = coalesce(nullif(p->>'status', '')::public.product_status, status),
    price = case
      when private.int_or_null(p->>'price') is not null then private.int_or_null(p->>'price')
      when v_pct is not null then greatest(0, round(price * (100 + v_pct) / 100.0)::integer)
      else price end,
    stock = case
      when private.int_or_null(p->>'stock') is not null
           and not exists (select 1 from public.product_variants v where v.product_id = products.id and v.is_active)
      then private.int_or_null(p->>'stock') else stock end
  where id = any (p_ids);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'updated', v_n);
end $$;

-- Photos uploaded for an imported product: appended in order, and the matched
-- file names are struck from the waiting list.
create function public.admin_attach_product_images(p_product_id uuid, p_images jsonb, p_matched_names text[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_image jsonb;
  v_next integer;
begin
  perform private.require_role('admin', 'manager');
  select coalesce(max(sort_order), 0) into v_next from public.product_images where product_id = p_product_id;
  for v_image in select value from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) loop
    if not private.valid_image_key(v_image->>'storage_key') then
      raise exception using errcode = 'P0001', message = 'invalid_image';
    end if;
    v_next := v_next + 1;
    insert into public.product_images (product_id, storage_key, widths, width, height, alt, sort_order)
    values (p_product_id, v_image->>'storage_key', private.int_widths(v_image->'widths'),
            private.int_or_null(v_image->>'width'), private.int_or_null(v_image->>'height'),
            left(coalesce(v_image->>'alt', ''), 200), v_next);
  end loop;
  update public.products set import_photo_files = array(
    select f from unnest(import_photo_files) f
    where lower(f) <> all (select lower(m) from unnest(coalesce(p_matched_names, '{}')) m))
  where id = p_product_id;
  return jsonb_build_object('ok', true);
end $$;

-- Spreadsheet import (docs/product-upload-template.xlsx), all or nothing.
-- p_rows:    [{title, category, price, compare_at_price, stock, status, tags, description_html,
--              photo_files: [..], seo_title, seo_description}]
-- p_colours: [{product_title, name, color_hex, stock}]
create function public.admin_import_products(p_rows jsonb, p_colours jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  r jsonb;
  c jsonb;
  n integer := 0;
  v_cat uuid;
  v_id uuid;
  v_ids jsonb := '{}'::jsonb;
  v_status text;
begin
  perform private.require_role('admin', 'manager');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 500 then
    raise exception using errcode = 'P0001', message = 'invalid_items';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    select id into v_cat from public.categories where lower(name) = lower(btrim(coalesce(r->>'category', ''))) limit 1;
    if v_cat is null then
      raise exception using errcode = 'P0001', message = 'import_row_' || n || ':unknown_category';
    end if;
    if char_length(btrim(coalesce(r->>'title', ''))) = 0 then
      raise exception using errcode = 'P0001', message = 'import_row_' || n || ':missing_title';
    end if;
    if private.int_or_null(r->>'price') is null then
      raise exception using errcode = 'P0001', message = 'import_row_' || n || ':invalid_price';
    end if;
    if v_ids ? lower(btrim(r->>'title')) then
      raise exception using errcode = 'P0001', message = 'import_row_' || n || ':duplicate_title';
    end if;
    v_status := case when lower(coalesce(r->>'status', '')) = 'draft' then 'draft' else 'active' end;
    insert into public.products (title, slug, status, price, compare_at_price, stock, category_id, tags,
                                 description_html, seo_title, seo_description, import_photo_files)
    values (btrim(r->>'title'), private.unique_product_slug(r->>'title', null), v_status::public.product_status,
            private.int_or_null(r->>'price'),
            case when private.int_or_null(r->>'compare_at_price') > private.int_or_null(r->>'price')
                 then private.int_or_null(r->>'compare_at_price') end,
            coalesce(private.int_or_null(r->>'stock'), 0), v_cat, private.text_array(r->'tags'),
            coalesce(r->>'description_html', ''), nullif(btrim(coalesce(r->>'seo_title', '')), ''),
            nullif(btrim(coalesce(r->>'seo_description', '')), ''),
            coalesce((select array_agg(btrim(f)) from jsonb_array_elements_text(coalesce(r->'photo_files', '[]'::jsonb)) f
                      where btrim(f) <> ''), '{}'))
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(lower(btrim(r->>'title')), v_id);
  end loop;

  n := 0;
  for c in select value from jsonb_array_elements(coalesce(p_colours, '[]'::jsonb)) loop
    n := n + 1;
    if not (v_ids ? lower(btrim(coalesce(c->>'product_title', '')))) then
      raise exception using errcode = 'P0001', message = 'import_colour_' || n || ':unknown_product';
    end if;
    if char_length(btrim(coalesce(c->>'name', ''))) = 0 then
      raise exception using errcode = 'P0001', message = 'import_colour_' || n || ':missing_name';
    end if;
    if coalesce(c->>'color_hex', '') <> '' and c->>'color_hex' !~ '^#[0-9a-fA-F]{6}$' then
      raise exception using errcode = 'P0001', message = 'import_colour_' || n || ':invalid_colour';
    end if;
    insert into public.product_variants (product_id, name, color_hex, stock, sort_order)
    values ((v_ids->>lower(btrim(c->>'product_title')))::uuid, btrim(c->>'name'), nullif(c->>'color_hex', ''),
            coalesce(private.int_or_null(c->>'stock'), 0), n)
    on conflict (product_id, name) do update set stock = excluded.stock, color_hex = excluded.color_hex;
  end loop;

  return jsonb_build_object('ok', true, 'created', jsonb_array_length(p_rows));
end $$;

-- ---------------------------------------------------------------- categories, banners, coupons
create function public.admin_save_category(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p->>'id');
  v_name text := btrim(coalesce(p->>'name', ''));
  v_slug text := private.slugify(coalesce(nullif(btrim(p->>'slug'), ''), p->>'name'));
begin
  perform private.require_role('admin', 'manager');
  if char_length(v_name) = 0 or char_length(v_name) > 60 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  if exists (select 1 from public.categories where slug = v_slug and id is distinct from v_id) then
    raise exception using errcode = 'P0001', message = 'slug_taken';
  end if;
  if v_id is null then
    insert into public.categories (name, slug, description, sort_order, is_active, is_featured)
    values (v_name, v_slug, nullif(btrim(coalesce(p->>'description', '')), ''),
            coalesce(private.int_or_null(p->>'sort_order'), 0),
            coalesce((p->>'is_active')::boolean, true), coalesce((p->>'is_featured')::boolean, false))
    returning id into v_id;
  else
    update public.categories set name = v_name, slug = v_slug,
      description = nullif(btrim(coalesce(p->>'description', '')), ''),
      sort_order = coalesce(private.int_or_null(p->>'sort_order'), sort_order),
      is_active = coalesce((p->>'is_active')::boolean, is_active),
      is_featured = coalesce((p->>'is_featured')::boolean, is_featured)
    where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Hero banners: separate desktop (wide) and mobile (tall) images, so faces are
-- never cut off by cropping one picture for both.
create function public.admin_save_banner(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p->>'id');
  v_link text := nullif(btrim(coalesce(p->>'link_url', '')), '');
begin
  perform private.require_role('admin', 'manager');
  if not private.valid_image_key(p->>'desktop_key') or not private.valid_image_key(p->>'mobile_key') then
    raise exception using errcode = 'P0001', message = 'banner_images_required';
  end if;
  if v_link is not null and v_link !~ '^(/[^/]|/$|https://)' then
    raise exception using errcode = 'P0001', message = 'invalid_link';
  end if;
  if v_id is null then
    insert into public.banners (title, subtitle, cta_label, link_url, alt, sort_order, is_active, starts_at, ends_at,
      desktop_key, desktop_widths, desktop_width, desktop_height, mobile_key, mobile_widths, mobile_width, mobile_height)
    values (left(coalesce(p->>'title', ''), 120), nullif(left(coalesce(p->>'subtitle', ''), 200), ''),
      nullif(left(coalesce(p->>'cta_label', ''), 40), ''), v_link, left(coalesce(p->>'alt', ''), 200),
      coalesce(private.int_or_null(p->>'sort_order'), 0), coalesce((p->>'is_active')::boolean, false),
      nullif(p->>'starts_at', '')::timestamptz, nullif(p->>'ends_at', '')::timestamptz,
      p->>'desktop_key', private.int_widths(p->'desktop_widths'), private.int_or_null(p->>'desktop_width'), private.int_or_null(p->>'desktop_height'),
      p->>'mobile_key', private.int_widths(p->'mobile_widths'), private.int_or_null(p->>'mobile_width'), private.int_or_null(p->>'mobile_height'))
    returning id into v_id;
  else
    update public.banners set title = left(coalesce(p->>'title', ''), 120),
      subtitle = nullif(left(coalesce(p->>'subtitle', ''), 200), ''), cta_label = nullif(left(coalesce(p->>'cta_label', ''), 40), ''),
      link_url = v_link, alt = left(coalesce(p->>'alt', ''), 200),
      sort_order = coalesce(private.int_or_null(p->>'sort_order'), sort_order),
      is_active = coalesce((p->>'is_active')::boolean, is_active),
      starts_at = nullif(p->>'starts_at', '')::timestamptz, ends_at = nullif(p->>'ends_at', '')::timestamptz,
      desktop_key = p->>'desktop_key', desktop_widths = private.int_widths(p->'desktop_widths'),
      desktop_width = private.int_or_null(p->>'desktop_width'), desktop_height = private.int_or_null(p->>'desktop_height'),
      mobile_key = p->>'mobile_key', mobile_widths = private.int_widths(p->'mobile_widths'),
      mobile_width = private.int_or_null(p->>'mobile_width'), mobile_height = private.int_or_null(p->>'mobile_height')
    where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.admin_save_coupon(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid := private.try_uuid(p->>'id');
  v_code text := upper(btrim(coalesce(p->>'code', '')));
  v_type public.coupon_type;
  v_value integer := coalesce(private.int_or_null(p->>'value'), 0);
begin
  perform private.require_role('admin', 'manager');
  if v_code !~ '^[A-Z0-9_-]{3,32}$' then
    raise exception using errcode = 'P0001', message = 'invalid_code';
  end if;
  begin
    v_type := (p->>'type')::public.coupon_type;
  exception when others then
    raise exception using errcode = 'P0001', message = 'invalid_type';
  end;
  if v_type = 'percent' and v_value not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'invalid_percent';
  end if;
  if v_type = 'fixed' and v_value < 1 then
    raise exception using errcode = 'P0001', message = 'invalid_value';
  end if;
  if v_type = 'free_shipping' then
    v_value := 0;
  end if;
  if exists (select 1 from public.coupons where code = v_code and id is distinct from v_id) then
    raise exception using errcode = 'P0001', message = 'code_taken';
  end if;
  if v_id is null then
    insert into public.coupons (code, type, value, max_discount, min_order, starts_at, expires_at, usage_limit, is_active)
    values (v_code, v_type, v_value, private.int_or_null(p->>'max_discount'), coalesce(private.int_or_null(p->>'min_order'), 0),
            nullif(p->>'starts_at', '')::timestamptz, nullif(p->>'expires_at', '')::timestamptz,
            nullif(private.int_or_null(p->>'usage_limit'), 0), coalesce((p->>'is_active')::boolean, true))
    returning id into v_id;
  else
    update public.coupons set code = v_code, type = v_type, value = v_value,
      max_discount = private.int_or_null(p->>'max_discount'), min_order = coalesce(private.int_or_null(p->>'min_order'), 0),
      starts_at = nullif(p->>'starts_at', '')::timestamptz, expires_at = nullif(p->>'expires_at', '')::timestamptz,
      usage_limit = nullif(private.int_or_null(p->>'usage_limit'), 0), is_active = coalesce((p->>'is_active')::boolean, is_active)
    where id = v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ---------------------------------------------------------------- nightly orphan-image sweep
-- A random secret, created here and kept in Supabase Vault. pg_cron sends it to
-- /api/sweep/storage; the site reads it back through get_sweep_secret() with the
-- service key. It is never written into code, env files or chat.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sweep_secret',
                           'Shared secret for /api/sweep/* calls from pg_cron');

create function public.get_sweep_secret() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sweep_secret'
$$;

-- Uploaded files that no product image or banner uses any more, older than a day
-- (so a form that is still being filled in never loses its photos).
create function public.sweep_orphan_image_files(p_limit integer default 500) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(o.name), '{}') from (
    select o.name from storage.objects o
    where o.bucket_id = 'product-images'
      and o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.product_images i where o.name like i.storage_key || '-%')
      and not exists (select 1 from public.banners b where o.name like b.desktop_key || '-%' or o.name like b.mobile_key || '-%')
    order by o.created_at
    limit p_limit) o
$$;

create extension if not exists pg_net;
create extension if not exists pg_cron;

create function private.call_sweep(p_path text) returns bigint
language sql volatile security definer set search_path = '' as $$
  select net.http_post(
    url := (select value from private.app_config where key = 'site_url') || p_path,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sweep-secret', public.get_sweep_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
$$;

select cron.schedule('sweep-orphan-images', '17 3 * * *', $$select private.call_sweep('/api/sweep/storage')$$);

-- ---------------------------------------------------------------- grants
grant execute on function public.admin_save_product(jsonb), public.admin_bulk_update_products(uuid[], jsonb),
  public.admin_attach_product_images(uuid, jsonb, text[]), public.admin_import_products(jsonb, jsonb),
  public.admin_save_category(jsonb), public.admin_save_banner(jsonb), public.admin_save_coupon(jsonb)
  to authenticated;
grant execute on function public.get_sweep_secret(), public.sweep_orphan_image_files(integer) to service_role;
