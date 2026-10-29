'use client';
// Upload many photos at once; each is matched by file name to the product whose
// spreadsheet row listed it, and attached in the listed order.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadImage } from './ImageUploader.js';
import { attachImportedPhotos } from '../../lib/admin/catalog-actions.js';

export default function PhotoMatcher({ waiting }) {
  const router = useRouter();
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const index = new Map();
  for (const p of waiting) p.import_photo_files.forEach((name, pos) => index.set(name.toLowerCase(), { product: p, pos }));

  async function onFiles(fileList) {
    setBusy(true);
    const lines = [];
    const byProduct = new Map();
    for (const file of [...fileList]) {
      const hit = index.get(file.name.toLowerCase());
      if (!hit) { lines.push(`✗ ${file.name}: no product lists this file name`); continue; }
      if (!byProduct.has(hit.product.id)) byProduct.set(hit.product.id, []);
      byProduct.get(hit.product.id).push({ file, pos: hit.pos });
    }
    for (const [productId, files] of byProduct) {
      files.sort((a, b) => a.pos - b.pos);
      const images = [];
      const names = [];
      for (const { file } of files) {
        try {
          images.push({ ...(await uploadImage(file)), alt: '' });
          names.push(file.name);
          lines.push(`✓ ${file.name}`);
        } catch (err) {
          lines.push(`✗ ${file.name}: ${err.message}`);
        }
        setLog([...lines]);
      }
      if (images.length) {
        const r = await attachImportedPhotos(productId, images, names);
        if (r?.error) lines.push(`✗ could not attach to product: ${r.error}`);
      }
    }
    setLog(lines);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="form-grid">
      <label className="btn btn-primary upload-btn" style={{ justifySelf: 'start' }}>
        {busy ? 'Uploading…' : 'Choose photos (you can select many)'}
        <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      </label>
      {log.length > 0 && <ul className="plain-list">{log.map((l, i) => <li key={i} className={l.startsWith('✗') ? 'error-text' : 'ok-text'}>{l}</li>)}</ul>}
    </div>
  );
}
