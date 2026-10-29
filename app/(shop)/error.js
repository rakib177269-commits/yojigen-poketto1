'use client';
import Link from 'next/link';
import { SITE } from '../../lib/site.js';

export default function Error({ reset }) {
  return (
    <div className="container narrow" style={{ textAlign: 'center' }}>
      <h1 className="display" style={{ fontSize: 36 }}>Something went wrong</h1>
      <p>Please try again. If it keeps happening, call or WhatsApp us on {SITE.phone}.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <Link href="/" className="btn btn-ghost">Home</Link>
      </div>
    </div>
  );
}
