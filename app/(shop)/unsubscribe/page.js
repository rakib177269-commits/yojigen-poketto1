
export const metadata = { title: 'Unsubscribe', robots: { index: false, follow: false } };

// Linked from every newsletter email. A GET only shows the button; the actual
// unsubscribe is a POST, so link scanners in mail apps can't unsubscribe people.
export default async function UnsubscribePage({ searchParams }) {
  const { token, done } = await searchParams;
  let message = null;
  if (done === '1') message = 'You have been unsubscribed. You won\'t get newsletter emails from us any more.';
  if (done === '0') message = 'This unsubscribe link is invalid or has already been used.';

  return (
    <div className="container narrow" style={{ textAlign: 'center' }}>
      <h1 className="display" style={{ fontSize: 34 }}>Newsletter</h1>
      {message ? <p>{message}</p> : token ? (
        <form method="post" action="/api/newsletter/unsubscribe">
          <input type="hidden" name="token" value={String(token).slice(0, 64)} />
          <p>Stop receiving newsletter emails from Yojigen Poketto?</p>
          <button className="btn btn-primary" type="submit">Unsubscribe</button>
        </form>
      ) : <p>This unsubscribe link is missing its code.</p>}
    </div>
  );
}

export { callRpc };
