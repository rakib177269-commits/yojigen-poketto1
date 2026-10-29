import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container narrow" style={{ textAlign: 'center' }}>
      <span className="eyebrow">404</span>
      <h1 className="display" style={{ fontSize: 40 }}>This page slipped out of our pocket.</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/" className="btn btn-ghost">Home</Link>
        <Link href="/shop" className="btn btn-primary">Shop all products</Link>
      </div>
    </div>
  );
}
