'use client';
import { startTransition, useActionState, useState } from 'react';
import { importProducts } from '../../lib/admin/catalog-actions.js';
import { formatTaka } from '../../lib/format.js';

export default function ImportForm() {
  const [state, action, pending] = useActionState(importProducts, null);
  // Submitted by hand rather than as a form action: React resets a form after
  // a form action, which would clear the chosen file before "Import" is pressed.
  const [file, setFile] = useState(null);
  const [checked, setChecked] = useState(null); // the file the preview belongs to
  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('file', file);
    fd.set('confirm', e.nativeEvent.submitter?.value === 'import' ? '1' : '0');
    setChecked(file);
    startTransition(() => action(fd));
  };
  const showPreview = state?.preview && checked === file;
  return (
    <form onSubmit={submit} className="form-grid">
      <div className="field">
        <label htmlFor="xlsx">Filled-in product sheet (.xlsx)</label>
        <input id="xlsx" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="form-actions">
        <button className="btn btn-ghost" value="check" disabled={pending}>{pending ? 'Working…' : 'Check file'}</button>
        {showPreview && (
          <button className="btn btn-primary" value="import" disabled={pending}>
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
      {showPreview && (
        <div className="notice">
          Ready: {state.preview.length} product(s), {state.colours} colour(s). If you edit the sheet, choose it again and check again.
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
