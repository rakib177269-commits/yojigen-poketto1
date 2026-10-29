'use client';
// Upload photos: shrink in the browser (max 2400px JPEG, keeps uploads under
// Netlify's 6 MB limit even for phone photos), then the server makes WebP sizes.
// Reorder with the arrow buttons (works on phones) or by dragging (desktop).
import { useRef, useState } from 'react';
import { defaultImageUrl } from '../../lib/images.js';

export async function shrink(file, maxSide = 2400) {
  if (!/^image\//.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4_000_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch {
    return file; // e.g. HEIC the browser can't decode: let the server try
  }
}

export async function uploadImage(file, kind = 'product') {
  const body = new FormData();
  body.append('file', await shrink(file));
  body.append('kind', kind);
  const res = await fetch('/api/admin/upload', { method: 'POST', body });
  const data = await res.json().catch(() => ({ error: 'Upload failed' }));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.image;
}

export default function ImageUploader({ images, onChange, kind = 'product', multiple = true, label = 'Add photos' }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const dragFrom = useRef(null);

  async function onFiles(files) {
    setError('');
    const list = [...files];
    setBusy(list.length);
    const added = [];
    for (const f of list) {
      try {
        added.push({ ...(await uploadImage(f, kind)), alt: '' });
      } catch (err) {
        setError(`${f.name}: ${err.message}`);
      }
      setBusy((n) => n - 1);
    }
    onChange(multiple ? [...images, ...added] : added.slice(-1));
  }
  const move = (from, to) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };

  return (
    <div className="uploader">
      <div className="thumb-grid">
        {images.map((img, i) => (
          <figure
            key={img.id ?? img.storage_key}
            className="thumb-card"
            draggable
            onDragStart={() => { dragFrom.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { move(dragFrom.current, i); dragFrom.current = null; }}
          >
            <img src={defaultImageUrl(img.storage_key, img.widths, 400)} alt="" />
            {i === 0 && multiple && <span className="tag">Main</span>}
            <input className="input input-sm" placeholder="Describe the photo" aria-label={`Photo ${i + 1} description`}
              value={img.alt ?? ''} onChange={(e) => onChange(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
            <div className="row-gap">
              {multiple && <button type="button" className="btn btn-ghost btn-sm" aria-label="Move earlier" onClick={() => move(i, i - 1)} disabled={i === 0}>←</button>}
              {multiple && <button type="button" className="btn btn-ghost btn-sm" aria-label="Move later" onClick={() => move(i, i + 1)} disabled={i === images.length - 1}>→</button>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(images.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </figure>
        ))}
      </div>
      <label className="btn btn-ghost btn-sm upload-btn">
        {busy ? `Uploading ${busy}…` : label}
        <input type="file" accept="image/*" multiple={multiple} hidden disabled={busy > 0}
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
