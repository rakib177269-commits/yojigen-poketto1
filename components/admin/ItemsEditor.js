'use client';
// Pick products/colours and quantities. Emits hidden inputs named
// qty:<product_id>:<variant_id> that the server action reads. Prices shown here
// are for the operator's information; the database re-prices on save.
import { useState } from 'react';
import { formatTaka } from '../../lib/format.js';

export default function ItemsEditor({ options, initial = [] }) {
  const [rows, setRows] = useState(initial);
  const [pick, setPick] = useState('');
  const keyOf = (r) => `${r.product_id}:${r.variant_id ?? ''}`;
  const byKey = new Map(options.map((o) => [o.key, o]));

  function add() {
    const o = byKey.get(pick);
    if (!o) return;
    setRows((cur) => (cur.some((r) => keyOf(r) === o.key)
      ? cur.map((r) => (keyOf(r) === o.key ? { ...r, quantity: r.quantity + 1 } : r))
      : [...cur, { product_id: o.product_id, variant_id: o.variant_id, quantity: 1 }]));
    setPick('');
  }
  const setQty = (k, q) => setRows((cur) => cur.map((r) => (keyOf(r) === k ? { ...r, quantity: Math.max(0, Math.min(99, q)) } : r)).filter((r) => r.quantity > 0));
  const subtotal = rows.reduce((n, r) => n + (byKey.get(keyOf(r))?.price ?? 0) * r.quantity, 0);

  return (
    <div className="items-editor">
      {rows.length === 0 && <p className="hint">No items yet.</p>}
      {rows.map((r) => {
        const o = byKey.get(keyOf(r));
        return (
          <div className="items-row" key={keyOf(r)}>
            <span>{o?.label ?? 'Unavailable product'}<span className="hint"> · {o ? `${formatTaka(o.price)} · ${o.stock} in stock` : ''}</span></span>
            <input type="hidden" name={`qty:${keyOf(r)}`} value={r.quantity} />
            <span className="qty">
              <button type="button" aria-label="Decrease" onClick={() => setQty(keyOf(r), r.quantity - 1)}>−</button>
              <span>{r.quantity}</span>
              <button type="button" aria-label="Increase" onClick={() => setQty(keyOf(r), r.quantity + 1)}>+</button>
            </span>
          </div>
        );
      })}
      <div className="row-gap" style={{ marginTop: 10 }}>
        <label htmlFor="add-item" className="sr-only">Add a product</label>
        <select id="add-item" className="select" value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 360 }}>
          <option value="">Add a product…</option>
          {options.map((o) => <option key={o.key} value={o.key} disabled={o.stock <= 0}>{o.label} — {formatTaka(o.price)}{o.stock <= 0 ? ' (sold out)' : ''}</option>)}
        </select>
        <button type="button" className="btn btn-ghost btn-sm" onClick={add} disabled={!pick}>Add</button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Items subtotal (current prices): <strong>{formatTaka(subtotal)}</strong></p>
    </div>
  );
}
