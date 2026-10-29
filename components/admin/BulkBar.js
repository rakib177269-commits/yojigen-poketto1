'use client';
// Select products in the list, then change status / price / stock together.
import { useActionState, useState } from 'react';
import { bulkUpdate } from '../../lib/admin/catalog-actions.js';

export default function BulkBar({ formId }) {
  const [state, action, pending] = useActionState(bulkUpdate, null);
  const [mode, setMode] = useState('status');
  return (
    <form id={formId} action={action} className="panel bulk-bar">
      <strong>With selected:</strong>
      <select className="select input-sm" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="What to change">
        <option value="status">Set status</option>
        <option value="price">Set price</option>
        <option value="percent">Change price by %</option>
        <option value="stock">Set stock (no-colour products)</option>
      </select>
      {mode === 'status' && (
        <select name="status" className="select input-sm" aria-label="Status" defaultValue="active">
          <option value="active">Active</option><option value="draft">Draft</option>
          <option value="hidden">Hidden</option><option value="archived">Archived</option>
        </select>
      )}
      {mode === 'price' && <input name="price" className="input input-sm" inputMode="numeric" placeholder="৳" aria-label="New price" />}
      {mode === 'percent' && <input name="price_change_percent" className="input input-sm" inputMode="numeric" placeholder="e.g. -10" aria-label="Percent change" />}
      {mode === 'stock' && <input name="stock" className="input input-sm" inputMode="numeric" placeholder="Stock" aria-label="Stock" />}
      <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? 'Applying…' : 'Apply'}</button>
      {state?.error && <span className="error-text" role="alert">{state.error}</span>}
      {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
    </form>
  );
}
