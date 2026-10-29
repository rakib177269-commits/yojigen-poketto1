'use client';
// Orders list (Confirmed tab): tick orders, send them all to Pathao.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendManyToPathao } from '../../lib/admin/courier-actions.js';

export default function PathaoBulk({ formId, codes }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [results, setResults] = useState(null);
  function submit(e) {
    e.preventDefault();
    const ids = new FormData(e.currentTarget).getAll('ids').map(String);
    if (!ids.length) { setResults([{ error: 'Tick at least one order.' }]); return; }
    start(async () => {
      const r = await sendManyToPathao(ids);
      setResults(r.results ?? [{ error: r.error }]);
      router.refresh();
    });
  }
  return (
    <form id={formId} onSubmit={submit} className="panel bulk-bar">
      <strong>With ticked orders:</strong>
      <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? 'Sending to Pathao…' : 'Send to Pathao'}</button>
      {results && (
        <ul className="result-list" style={{ flexBasis: '100%' }}>
          {results.map((r, i) => (
            <li key={r.id ?? i} className={r.error ? 'error-text' : 'ok-text'}>
              {r.id && <strong>{codes[r.id] ?? ''} </strong>}{r.error ?? r.ok}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
