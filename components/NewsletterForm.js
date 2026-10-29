'use client';
import { useState } from 'react';

export default function NewsletterForm() {
  const [state, setState] = useState({ status: 'idle', message: '' });
  async function onSubmit(e) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email');
    setState({ status: 'busy', message: '' });
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setState(data.ok
        ? { status: 'done', message: 'Thanks! You\'re subscribed. Every email has an unsubscribe link.' }
        : { status: 'error', message: data.message });
    } catch {
      setState({ status: 'error', message: 'Could not subscribe right now. Please try again.' });
    }
  }
  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="newsletter-email" className="sr-only">Email address</label>
      <div className="newsletter">
        <input id="newsletter-email" name="email" type="email" required autoComplete="email" className="input" placeholder="Your email" />
        <button className="btn" type="submit" disabled={state.status === 'busy'}>Join</button>
      </div>
      <p className="newsletter-msg" role="status">{state.message}</p>
    </form>
  );
}
