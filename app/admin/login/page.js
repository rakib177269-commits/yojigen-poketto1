import { redirect } from 'next/navigation';
import LoginForms from '../../../components/admin/LoginForms.js';
import { getStaff } from '../../../lib/server/auth.js';

export const metadata = { title: 'Staff sign-in' };

const ERRORS = {
  link: 'That sign-in link is invalid or expired, or it was opened in a different browser. Request a new one here.',
  access: 'This account does not have staff access. Ask the owner to invite you.',
};

export default async function LoginPage({ searchParams }) {
  if (await getStaff()) redirect('/admin');
  const { error } = await searchParams;
  return (
    <main className="admin-login">
      <div style={{ width: '100%', maxWidth: 400 }}>
        <p className="wordmark-main" style={{ textAlign: 'center', marginBottom: 6 }}>Yojigen Poketto</p>
        <h1 style={{ textAlign: 'center', fontSize: 20, marginBottom: 20 }}>Staff sign-in</h1>
        <LoginForms initialError={ERRORS[error] ?? null} />
        <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
          First time? Use the email link. You can add a password afterwards under “My account”.
        </p>
      </div>
    </main>
  );
}
