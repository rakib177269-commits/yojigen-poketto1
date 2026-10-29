-- 0013 Catalogue removals (phase 4). Kept apart because the Supabase connector
-- asks for confirmation on DELETE; the owner applies this file in the SQL editor.
-- Removed image files are cleaned out of Storage by the nightly sweep (0012).

create function public.admin_remove_product_image(p_image_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager');
  delete from public.product_images where id = p_image_id;
  return jsonb_build_object('ok', true);
end $$;

-- Order history keeps the product's title and price (order_items stores them).
create function public.admin_delete_product(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager');
  delete from public.products where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- Products in a deleted category become uncategorised.
create function public.admin_delete_category(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager');
  delete from public.categories where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create function public.admin_delete_banner(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager');
  delete from public.banners where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- A coupon that has been used stays (orders refer to it); switch it off instead.
create function public.admin_delete_coupon(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_role('admin', 'manager');
  if exists (select 1 from public.coupons where id = p_id and used_count > 0) then
    raise exception using errcode = 'P0001', message = 'coupon_used';
  end if;
  delete from public.coupons where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.admin_remove_product_image(uuid), public.admin_delete_product(uuid),
  public.admin_delete_category(uuid), public.admin_delete_banner(uuid), public.admin_delete_coupon(uuid)
  to authenticated;
