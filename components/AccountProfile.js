'use client';
import { useActionState } from 'react';
import { saveProfile } from '../lib/account-actions.js';

export default function AccountProfile({ name, email }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  return (
    <form action={action} className="form-grid">
      <div className="field"><label htmlFor="pf-name">Name</label>
        <input id="pf-name" name="name" className="input" defaultValue={name ?? ''} autoComplete="name" maxLength={80} /></div>
      <div className="field"><label htmlFor="pf-email">Email (optional, for order emails)</label>
        <input id="pf-email" name="email" type="email" className="input" defaultValue={email ?? ''} autoComplete="email" /></div>
      <div className="row-gap">
        <button className="btn btn-ghost" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        {state?.error && <span className="error-text" role="alert">{state.error}</span>}
        {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      </div>
    </form>
  );
}
