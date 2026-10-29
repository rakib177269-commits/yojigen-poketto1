import TrackForm from '../../../components/TrackForm.js';

export const metadata = { title: 'Track your order', robots: { index: false, follow: true } };

export default async function TrackPage({ searchParams }) {
  const { code } = await searchParams;
  return (
    <div className="container narrow">
      <h1 className="display" style={{ fontSize: 36 }}>Track your order</h1>
      <p>Enter the order code from your confirmation and the mobile number you ordered with.</p>
      <TrackForm initialCode={typeof code === 'string' ? code.slice(0, 20) : ''} />
    </div>
  );
}
