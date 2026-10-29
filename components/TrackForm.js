'use client';
import { useState } from 'react';
import OrderDetails from './OrderDetails.js';

export default function TrackForm({ initialCode = '' }) {
  const [state, setState] = useState({ status: 'idle', order: null, message: '' });
  async function onSubmit(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setState({ status: 'busy', order: null, message: '' });
    try {
      const res = await fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await res.json();
      setState(body.ok ? { status: 'done', order: body.order, message: '' } : { status: 'error', order: null, message: body.message });
    } catch {
      setState({ status: 'error', order: null, message: 'Could not reach the server. Please try again.' });
    }
  }
  return (
    <>
      <form className="panel form-grid" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="code">Order code</label>
          <input id="code" name="code" className="input" defaultValue={initialCode} placeholder="YPXXXXXXX" autoCapitalize="characters" required />
        </div>
        <div className="field">
          <label htmlFor="track-phone">Mobile number used for the order</label>
          <input id="track-phone" name="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXX-XXXXXX" required />
        </div>
        <button className="btn btn-primary" type="submit" disabled={state.status === 'busy'}>
          {state.status === 'busy' ? 'Checking…' : 'Track order'}
        </button>
        {state.message && <div className="alert" role="alert">{state.message}</div>}
      </form>
      {state.order && <div style={{ marginTop: 20 }}><OrderDetails order={state.order} /></div>}
    </>
  );
}
