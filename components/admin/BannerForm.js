'use client';
import { useActionState, useState } from 'react';
import { saveBanner } from '../../lib/admin/catalog-actions.js';
import ImageUploader from './ImageUploader.js';

const local = (iso) => (iso ? new Date(new Date(iso).getTime() + 6 * 3600e3).toISOString().slice(0, 16) : '');
const toIso = (v) => (v ? `${v}:00+06:00` : '');
const img = (b, side) => (b?.[`${side}_key`] ? [{ storage_key: b[`${side}_key`], widths: b[`${side}_widths`], width: b[`${side}_width`], height: b[`${side}_height`] }] : []);

export default function BannerForm({ banner }) {
  const [state, action, pending] = useActionState(saveBanner, null);
  const [desktop, setDesktop] = useState(img(banner, 'desktop'));
  const [mobile, setMobile] = useState(img(banner, 'mobile'));
  const [f, setF] = useState({
    title: banner?.title ?? '', subtitle: banner?.subtitle ?? '', link_url: banner?.link_url ?? '', alt: banner?.alt ?? '',
    sort_order: banner?.sort_order ?? 0, is_active: banner?.is_active ?? false,
    starts_at: local(banner?.starts_at), ends_at: local(banner?.ends_at),
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const d = desktop[0];
  const m = mobile[0];
  const payload = JSON.stringify({
    ...f, id: banner?.id, starts_at: toIso(f.starts_at), ends_at: toIso(f.ends_at),
    desktop_key: d?.storage_key, desktop_widths: d?.widths, desktop_width: d?.width, desktop_height: d?.height,
    mobile_key: m?.storage_key, mobile_widths: m?.widths, mobile_width: m?.width, mobile_height: m?.height,
  });
  const k = banner?.id ?? 'new';

  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="payload" value={payload} />
      <div className="form-2">
        <div><div className="label">Desktop image (wide, e.g. 1920×800)</div>
          <ImageUploader images={desktop} onChange={setDesktop} kind="banner-desktop" multiple={false} label={d ? 'Replace' : 'Upload desktop image'} /></div>
        <div><div className="label">Mobile image (tall, e.g. 1080×1350)</div>
          <ImageUploader images={mobile} onChange={setMobile} kind="banner-mobile" multiple={false} label={m ? 'Replace' : 'Upload mobile image'} /></div>
      </div>
      <p className="hint">Two separate crops so faces and products are never cut off on phones.</p>
      <div className="form-2">
        <div className="field"><label htmlFor={`bt-${k}`}>Headline (optional)</label><input id={`bt-${k}`} className="input" value={f.title} onChange={set('title')} /></div>
        <div className="field"><label htmlFor={`bs-${k}`}>Subtitle (optional)</label><input id={`bs-${k}`} className="input" value={f.subtitle} onChange={set('subtitle')} /></div>
      </div>
      <div className="form-2">
        <div className="field"><label htmlFor={`bl-${k}`}>Link (optional)</label><input id={`bl-${k}`} className="input" value={f.link_url} onChange={set('link_url')} placeholder="/shop/gifts" /></div>
        <div className="field"><label htmlFor={`ba-${k}`}>Image description (for screen readers)</label><input id={`ba-${k}`} className="input" value={f.alt} onChange={set('alt')} /></div>
      </div>
      <div className="form-2">
        <div className="field"><label htmlFor={`bst-${k}`}>Show from (optional)</label><input id={`bst-${k}`} type="datetime-local" className="input" value={f.starts_at} onChange={set('starts_at')} /></div>
        <div className="field"><label htmlFor={`ben-${k}`}>Show until (optional)</label><input id={`ben-${k}`} type="datetime-local" className="input" value={f.ends_at} onChange={set('ends_at')} /></div>
      </div>
      <div className="row-gap">
        <label className="check"><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> Live on the home page</label>
        <label className="check">Order <input className="input input-sm" style={{ width: 70 }} value={f.sort_order} onChange={set('sort_order')} aria-label="Order" /></label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save banner'}</button>
        {state?.error && <span className="error-text" role="alert">{state.error}</span>}
        {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      </div>
    </form>
  );
}
