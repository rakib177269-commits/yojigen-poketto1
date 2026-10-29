-- 0004 Categories and SAMPLE products so the site is never empty while building.
-- Every sample product has is_sample = true and is shown with a "Sample" badge.
-- They are deleted by a later migration before launch (see DEPLOY.md checklist).

insert into public.categories (name, slug, description, sort_order, is_featured) values
  ('Gadgets', 'gadgets', 'Small, clever things that make the day easier.', 10, true),
  ('Gifts', 'gifts', 'Thoughtful gifts, ready to give.', 20, true),
  ('Cute Items', 'cute-items', 'Soft, sweet and impossible to resist.', 30, true),
  ('Accessories', 'accessories', 'Little details that finish the look.', 40, true);

with p (title, slug, cat, price, compare_at, stock, tags, descr, created_offset) as (values
  ('Mini Rechargeable Desk Fan', 'mini-rechargeable-desk-fan', 'gadgets', 690, 850, 0,
   array['fan', 'usb', 'summer', 'desk'],
   '<p>A quiet three-speed fan that sits on any desk and charges over USB-C.</p><ul><li>3 speeds</li><li>Up to 6 hours per charge</li><li>Foldable stand</li></ul>', 1),
  ('Moon Night Light', 'moon-night-light', 'gadgets', 890, null, 6,
   array['lamp', 'light', 'bedroom', 'gift'],
   '<p>A soft, warm glow shaped like a full moon. Touch to switch between warm and cool light.</p>', 2),
  ('Magnetic Phone Stand', 'magnetic-phone-stand', 'gadgets', 450, null, 20,
   array['phone', 'stand', 'desk'],
   '<p>A slim aluminium stand that holds your phone at the right angle for calls and videos.</p>', 3),
  ('Gift Box Starter Set', 'gift-box-starter-set', 'gifts', 1450, null, 4,
   array['gift', 'box', 'birthday', 'set'],
   '<p>A ready-to-give box with a mug, a notebook and a scented candle. Wrapped and ribbon-tied.</p>', 4),
  ('Scented Candle Duo', 'scented-candle-duo', 'gifts', 750, 900, 10,
   array['candle', 'gift', 'home'],
   '<p>Two soy candles in calm scents: vanilla and fresh linen. About 20 hours each.</p>', 5),
  ('Plush Cat Keychain', 'plush-cat-keychain', 'cute-items', 290, null, 0,
   array['plush', 'cat', 'keychain', 'cute'],
   '<p>A palm-sized plush cat on a sturdy ring. Clips onto bags, keys and zips.</p>', 6),
  ('Pastel Sticky Note Set', 'pastel-sticky-note-set', 'cute-items', 220, null, 30,
   array['stationery', 'notes', 'pastel'],
   '<p>Six pads of sticky notes in soft pastel shades, 50 sheets each.</p>', 7),
  ('Minimal Phone Strap', 'minimal-phone-strap', 'accessories', 350, null, 0,
   array['phone', 'strap', 'lanyard'],
   '<p>An adjustable crossbody strap that fits most phone cases with the included tab.</p>', 8),
  ('Canvas Tote Bag', 'canvas-tote-bag', 'accessories', 590, 690, 12,
   array['bag', 'tote', 'canvas'],
   '<p>A heavy cotton canvas tote with an inside pocket. Fits a laptop up to 14 inches.</p>', 9)
)
insert into public.products (title, slug, category_id, price, compare_at_price, stock, tags,
                             description_html, status, is_sample, created_at)
select p.title, p.slug, c.id, p.price, p.compare_at, p.stock, p.tags, p.descr, 'active', true,
       now() - make_interval(mins => p.created_offset)
from p join public.categories c on c.slug = p.cat;

with v (product_slug, name, color_hex, stock, sort_order) as (values
  ('mini-rechargeable-desk-fan', 'White', '#F5F5F2', 8, 1),
  ('mini-rechargeable-desk-fan', 'Sky Blue', '#9CC3E6', 5, 2),
  ('mini-rechargeable-desk-fan', 'Pink', '#F2B8C6', 0, 3),
  ('plush-cat-keychain', 'Grey', '#9EA3AB', 9, 1),
  ('plush-cat-keychain', 'Cream', '#EFE3CC', 7, 2),
  ('plush-cat-keychain', 'Peach', '#F6C1A6', 4, 3),
  ('minimal-phone-strap', 'Black', '#1C1C1E', 15, 1),
  ('minimal-phone-strap', 'Navy', '#1F2F55', 10, 2),
  ('minimal-phone-strap', 'Beige', '#D8C8AE', 6, 3)
)
insert into public.product_variants (product_id, name, color_hex, stock, sort_order)
select p.id, v.name, v.color_hex, v.stock, v.sort_order
from v join public.products p on p.slug = v.product_slug;

-- Bundled sample images live in /public/sample/<slug>-<width>.webp.
insert into public.product_images (product_id, storage_key, widths, width, height, alt, sort_order)
select p.id, '/sample/' || p.slug, array[400, 800, 1200], 1200, 1200, p.title || ' (sample image)', 0
from public.products p where p.is_sample;
