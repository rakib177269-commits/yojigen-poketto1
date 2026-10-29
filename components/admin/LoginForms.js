'use client';
import { useActionState, useState } from 'react';
import { sendSignInLink, signInWithPassword } from '../../lib/admin/auth-actions.js';

export default function LoginForms({ initialError }) {
  const [mode, setMode] = useState('link');
  const [linkState, linkAction, linkPending] = useActionState(sendSignInLink, null);
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, null);
  const error = mode === 'link' ? linkState?.error : pwState?.error;

  return (
    <div className="panel" style={{ display: 'grid', gap: 16 }}>
      {initialError && !linkState && !pwState && <div className="alert" role="alert">{initialError}</div>}
      {mode === 'link' ? (
        linkState?.sent ? (
          <div className="notice" role="status">{linkState.message}</div>
        ) : (
          <form action={linkAction} className="form-grid">
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" name="email" type="email" className="input" autoComplete="email" required />
            </div>
            <button className="btn btn-primary" disabled={linkPending}>{linkPending ? 'Sending…' : 'Email me a sign-in link'}</button>
          </form>
        )
      ) : (
        <form action={pwAction} className="form-grid">
          <div className="field">
            <label htmlFor="pw-email">Email</label>
            <input id="pw-email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" disabled={pwPending}>{pwPending ? 'Signing in…' : 'Sign in'}</button>
        </form>
      )}
      {error && <div className="alert" role="alert">{error}</div>}
      <button type="button" className="btn btn-ghost" onClick={() => setMode(mode === 'link' ? 'password' : 'link')}>
        {mode === 'link' ? 'Use a password instead' : 'Email me a link instead'}
      </button>
    </div>
  );
}
