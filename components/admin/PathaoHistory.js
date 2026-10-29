'use client';
// Pathao's delivery record for this phone number (all merchants), on request.
import { useState, useTransition } from 'react';
import { pathaoHistory } from '../../lib/admin/courier-actions.js';

export default function PathaoHistory({ phone }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState(null);
  const d = result?.data;
  return (
    <div style={{ marginTop: 10 }}>
      {!result && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending}
          onClick={() => start(async () => setResult(await pathaoHistory(phone)))}>
          {pending ? 'Asking Pathao…' : 'Check Pathao delivery history'}
        </button>
      )}
      {result?.error && <p className="error-text" role="alert">Pathao: {result.error}</p>}
      {result && !result.error && !d && <p className="hint">Pathao has no usable history for this number.</p>}
      {d && (
        <p style={{ margin: 0 }}>
          Pathao (all shops): <strong>{d.total}</strong> parcels
          {d.successful != null && <>, <strong>{d.successful}</strong> delivered</>}
          {d.rate != null && <> · <strong className={d.rate < 70 ? 'error-text' : 'ok-text'}>{d.rate}%</strong> success</>}
          {d.rating && <span className="hint"> · rated “{d.rating}”</span>}
          {result.cached && <span className="hint"> · checked within the last day</span>}
        </p>
      )}
    </div>
  );
}
