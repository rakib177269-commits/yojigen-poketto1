'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saveProduct, deleteProduct } from '../../lib/admin/catalog-actions.js';
import ImageUploader from './ImageUploader.js';
import RichText from './RichText.js';
import ActionButton from './ActionButton.js';
import { SITE } from '../../lib/site.js';

const STATUSES = [['active', 'Active — visible in the shop'], ['draft', 'Draft — not visible yet'],
  ['hidden', 'Hidden — temporarily off the shop'], ['archived', 'Archived — no longer sold']];

export default function ProductForm({ product, categories, canDelete }) {
  const [state, action, pending] = useActionState(saveProduct, null);
  const [f, setF] = useState(() => ({
    title: product?.title ?? '', slug: product?.slug ?? '', status: product?.status ?? 'draft',
    price: product?.price ?? '', compare_at_price: product?.compare_at_price ?? '', stock: product?.stock ?? 0,
    category_id: product?.category_id ?? '', tags: (product?.tags ?? []).join(', '),
    description_html: product?.description_html ?? '', seo_title: product?.seo_title ?? '', seo_description: product?.seo_description ?? '',
  }));
  const [variants, setVariants] = useState(() => (product?.variants ?? []).filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order).map((v) => ({ name: v.name, color_hex: v.color_hex ?? '', stock: v.stock })));
  const [images, setImages] = useState(() => [...(product?.images ?? [])].sort((a, b) => a.sort_order - b.sort_order));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const original = product?.images ?? [];
  const payload = JSON.stringify({
    ...f, id: product?.id, variants,
    images: images.map((i) => (i.id ? { id: i.id, alt: i.alt } : i)),
    removed_image_ids: original.filter((o) => !images.some((i) => i.id === o.id)).map((o) => o.id),
  });

  return (
    <form action={action} className="form-grid product-form">
      <input type="hidden" name="payload" value={payload} />
      <section className="panel form-grid">
        <div className="field"><label htmlFor="p-title">Title *</label>
          <input id="p-title" className="input" value={f.title} onChange={set('title')} required maxLength={140} /></div>
        <div className="form-2">
          <div className="field"><label htmlFor="p-status">Status</label>
            <select id="p-status" className="select" value={f.status} onChange={set('status')}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="field"><label htmlFor="p-cat">Category</label>
            <select id="p-cat" className="select" value={f.category_id} onChange={set('category_id')}>
              <option value="">— none —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
        </div>
        <div className="form-2">
          <div className="field"><label htmlFor="p-price">Price (৳) *</label>
            <input id="p-price" className="input" inputMode="numeric" value={f.price} onChange={set('price')} required /></div>
          <div className="field"><label htmlFor="p-compare">Compare-at price (৳)</label>
            <input id="p-compare" className="input" inputMode="numeric" value={f.compare_at_price ?? ''} onChange={set('compare_at_price')} placeholder="Old price, shown crossed out" /></div>
        </div>
      </section>

      <section className="panel">
        <h2>Photos</h2>
        <p className="hint">The first photo is the main one. Square photos on a plain background look best; nothing is cropped.</p>
        <ImageUploader images={images} onChange={setImages} />
      </section>

      <section className="panel form-grid">
        <h2>Stock and colours</h2>
        {variants.length === 0 ? (
          <div className="field" style={{ maxWidth: 200 }}><label htmlFor="p-stock">Stock</label>
            <input id="p-stock" className="input" inputMode="numeric" value={f.stock} onChange={set('stock')} /></div>
        ) : <p className="hint">Stock is counted per colour.</p>}
        {variants.map((v, i) => (
          <div key={i} className="variant-row">
            <input className="input" aria-label="Colour name" placeholder="Colour name" value={v.name}
              onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input type="color" aria-label="Colour" value={v.color_hex || '#cccccc'}
              onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, color_hex: e.target.value.toUpperCase() } : x)))} />
            <input className="input" aria-label="Stock" inputMode="numeric" value={v.stock} style={{ maxWidth: 90 }}
              onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }}
          onClick={() => setVariants([...variants, { name: '', color_hex: '', stock: 0 }])}>+ Add colour</button>
      </section>

      <section className="panel form-grid">
        <h2>Description</h2>
        <RichText id="p-desc" value={f.description_html} onChange={(html) => setF((x) => ({ ...x, description_html: html }))} />
        <div className="field"><label htmlFor="p-tags">Tags (comma separated, help search)</label>
          <input id="p-tags" className="input" value={f.tags} onChange={set('tags')} placeholder="fan, usb, summer" /></div>
      </section>

      <details className="panel">
        <summary><strong>Search engines (SEO)</strong> <span className="hint">optional</span></summary>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field"><label htmlFor="p-slug">Web address</label>
            <input id="p-slug" className="input" value={f.slug} onChange={set('slug')} placeholder="made from the title" />
            <span className="hint">{SITE.url.replace(/^https:\/\//, '')}/p/{f.slug || '…'}</span></div>
          <div className="field"><label htmlFor="p-seo-t">SEO title</label><input id="p-seo-t" className="input" value={f.seo_title} onChange={set('seo_title')} maxLength={70} /></div>
          <div className="field"><label htmlFor="p-seo-d">SEO description</label><textarea id="p-seo-d" className="textarea" value={f.seo_description} onChange={set('seo_description')} maxLength={160} /></div>
        </div>
      </details>

      <div className="form-actions sticky-save">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save product'}</button>
        {product?.slug && f.status === 'active' && <Link href={`/p/${product.slug}`} target="_blank" className="btn btn-ghost btn-sm">View in shop ↗</Link>}
        {state?.error && <span className="error-text" role="alert">{state.error}</span>}
        {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      </div>
      {product && canDelete && (
        <div style={{ marginTop: 8 }}>
          <ActionButton action={deleteProduct.bind(null, product.id)} className="btn btn-danger btn-sm"
            confirm="Delete this product permanently? Past orders keep their item names. Consider Archive instead.">Delete product</ActionButton>
        </div>
      )}
    </form>
  );
}
