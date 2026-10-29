'use client';
import { useActionState, useRef } from 'react';
import { importProducts } from '../../lib/admin/catalog-actions.js';
import { formatTaka } from '../../lib/format.js';

export default function ImportForm() {
  const [state, action, pending] = useActionState(importProducts, null);
  const confirm = useRef(null);
  return (
    <form action={action} className="form-grid">
      <div className="field">
        <label htmlFor="xlsx">Filled-in product sheet (.xlsx)</label>
        <input id="xlsx" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" required />
      </div>
      <input ref={confirm} type="hidden" name="confirm" value="0" />
      <div className="form-actions">
        <button className="btn btn-ghost" disabled={pending} onClick={() => { confirm.current.value = '0'; }}>{pending ? 'Checking…' : 'Check file'}</button>
        {state?.preview && (
          <button className="btn btn-primary" disabled={pending} onClick={() => { confirm.current.value = '1'; }}>
            Import {state.preview.length} product{state.preview.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {state?.errors && (
        <div className="alert" role="alert">
          <strong>Please fix these in the sheet and check again (nothing was imported):</strong>
          <ul>{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {state?.preview && (
        <div className="notice">
          Ready: {state.preview.length} product(s), {state.colours} colour(s). Select the same file again if you changed it.
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr><th>Title</th><th>Category</th><th>Price</th><th>Photos listed</th></tr></thead>
            <tbody>{state.preview.map((r, i) => <tr key={i}><td>{r.title}</td><td>{r.category}</td><td>{formatTaka(r.price)}</td><td>{r.photos}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {state?.imported != null && <div className="notice" role="status">Imported {state.imported} product(s). Now upload their photos below.</div>}
    </form>
  );
}
