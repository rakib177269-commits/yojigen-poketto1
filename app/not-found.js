import Link from 'next/link';

// Fallback for URLs outside the shop layout.
export default function NotFound() {
  return (
    <main className="maintenance">
      <div>
        <h1>Page not found</h1>
        <p><Link href="/" className="btn btn-primary">Go to the shop</Link></p>
      </div>
    </main>
  );
}
