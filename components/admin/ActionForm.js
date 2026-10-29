'use client';
// A form bound to a server action, with an inline success/error message.
import { useActionState } from 'react';

export default function ActionForm({ action, children, submitLabel, className = 'form-grid', submitClass = 'btn btn-primary' }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="form-actions">
        <button className={submitClass} disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        {state?.error && <span className="error-text" role="alert">{state.error}</span>}
        {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      </div>
    </form>
  );
}
