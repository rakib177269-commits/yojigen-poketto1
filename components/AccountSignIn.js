'use client';
// Sign in with your mobile number: we SMS a 6-digit code.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestCode, verifyCode } from '../lib/account-actions.js';

export default function AccountSignIn() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function send(e) {
    e.preventDefault();
    setError('');
    start(async () => {
      const r = await requestCode(phone);
      if (r.error) setError(r.error); else { setSentTo(r.sentTo); setCode(''); }
    });
  }
  function verify(e) {
    e.preventDefault();
    setError('');
    start(async () => {
      const r = await verifyCode(phone, code);
      if (r.error) setError(r.error); else router.refresh();
    });
  }

  return sentTo ? (
    <form className="panel form-grid" onSubmit={verify}>
      <p style={{ margin: 0 }}>We sent a 6-digit code to <strong>{sentTo}</strong>.</p>
      <div className="field">
        <label htmlFor="otp">Code from the SMS</label>
        <input id="otp" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={code}
          onChange={(e) => setCode(e.target.value)} required autoFocus />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Checking…' : 'Sign in'}</button>
      {error && <div className="alert" role="alert">{error}</div>}
      <button type="button" className="link-btn hint" style={{ justifySelf: 'start' }} onClick={() => { setSentTo(null); setError(''); }}>
        Use a different number or send a new code
      </button>
    </form>
  ) : (
    <form className="panel form-grid" onSubmit={send}>
      <div className="field">
        <label htmlFor="acc-phone">Mobile number</label>
        <input id="acc-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXX-XXXXXX"
          value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending…' : 'Send me a code'}</button>
      {error && <div className="alert" role="alert">{error}</div>}
      <p className="hint" style={{ margin: 0 }}>No password needed. Use the number you order with to see all your orders.</p>
    </form>
  );
}
