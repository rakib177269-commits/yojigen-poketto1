'use client';
// A button that runs a server action and shows its result inline.
import { useState, useTransition } from 'react';

export default function ActionButton({ action, children, className = 'btn btn-primary btn-sm', confirm: question }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState(null);
  return (
    <span className="action">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (question && !window.confirm(question)) return;
          start(async () => setResult(await action()));
        }}
      >
        {pending ? 'Working…' : children}
      </button>
      {result?.error && <span className="error-text" role="alert">{result.error}</span>}
    </span>
  );
}
