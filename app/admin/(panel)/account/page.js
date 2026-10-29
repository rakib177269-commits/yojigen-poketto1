import { requireStaff } from '../../../../lib/server/auth.js';
import { setPassword } from '../../../../lib/admin/auth-actions.js';
import ActionForm from '../../../../components/admin/ActionForm.js';

export const metadata = { title: 'My account' };

export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <>
      <h1 className="admin-h1">My account</h1>
      <section className="panel" style={{ maxWidth: 480 }}>
        <p>Signed in as <strong>{staff.email}</strong> · role <strong>{staff.role}</strong></p>
        <h2>Password</h2>
        <p className="hint">Optional. Lets you sign in without waiting for an email link.</p>
        <ActionForm action={setPassword} submitLabel="Save password">
          <div className="field"><label htmlFor="new-pw">New password (10+ characters)</label>
            <input id="new-pw" name="password" type="password" className="input" autoComplete="new-password" minLength={10} required /></div>
        </ActionForm>
      </section>
    </>
  );
}
