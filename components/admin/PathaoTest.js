'use client';
// Settings: log in to Pathao with the saved keys and list the merchant's stores.
import { useState, useTransition } from 'react';
import { testPathao } from '../../lib/admin/courier-actions.js';

export default function PathaoTest() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState(null);
  return (
    <div className="form-grid">
      <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} disabled={pending}
        onClick={() => start(async () => setResult(await testPathao()))}>
        {pending ? 'Connecting…' : 'Test connection and list my Pathao stores'}
      </button>
      {result?.error && <p className="error-text" role="alert">Could not connect: {result.error}</p>}
      {result?.stores && (
        result.stores.length === 0 ? <p className="hint">Connected, but this Pathao account has no stores yet. Create one in the Pathao merchant panel.</p> : (
          <div className="notice">
            Connected. Your stores (put the ID in “Pathao store ID” below):
            <ul className="result-list">
              {result.stores.map((s) => <li key={s.id}><strong>{s.id}</strong> · {s.name}{s.address ? ` · ${s.address}` : ''}{s.active === 0 || s.active === false ? ' · inactive' : ''}</li>)}
            </ul>
          </div>
        )
      )}
    </div>
  );
}
