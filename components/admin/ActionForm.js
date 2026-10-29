'use client';
// A form bound to a server action, with an inline success/error message.
// Submitted by hand (not as a form action) so React doesn't clear what was typed
// when the save fails; "create" forms pass resetOnSuccess to start fresh after.
import { startTransition, useActionState, useEffect, useRef } from 'react';

export default function ActionForm({ action, children, submitLabel, className = 'form-grid', submitClass = 'btn btn-primary', resetOnSuccess = false }) {
  const [state, formAction, pending] = useActionState(action, null);
  const form = useRef(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) form.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={form} className={className} onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      startTransition(() => formAction(data));
    }}>
      {children}
      <div className="form-actions">
        <button className={submitClass} disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        {state?.error && <span className="error-text" role="alert">{state.error}</span>}
        {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      </div>
    </form>
  );
}
