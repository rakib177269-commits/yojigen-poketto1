import { requireStaff } from '../../../../lib/server/auth.js';
import { cancelInvite, inviteStaff, updateStaff } from '../../../../lib/admin/actions.js';
import ActionForm from '../../../../components/admin/ActionForm.js';
import ActionButton from '../../../../components/admin/ActionButton.js';
import { formatDate } from '../../../../components/admin/ui.js';

export const metadata = { title: 'Team' };

const ROLE_HELP = {
  admin: 'Everything, including team, settings, CSV export and the audit log.',
  manager: 'Orders, abandoned carts and (later) products, coupons and campaigns.',
  support: 'Orders: confirm, reject, edit, customer check; abandoned carts.',
  packer: 'Sees confirmed orders only, prints invoices, marks them dispatched.',
};

function RoleSelect({ id, value }) {
  return (
    <select id={id} name="role" className="select" defaultValue={value}>
      {Object.keys(ROLE_HELP).map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );
}

export default async function TeamPage() {
  const staff = await requireStaff(['admin']);
  const { data: team, error } = await staff.supabase.rpc('admin_team');
  if (error) throw new Error(error.message);

  return (
    <>
      <h1 className="admin-h1">Team</h1>
      <section className="panel">
        <h2>Invite someone</h2>
        <ActionForm action={inviteStaff} submitLabel="Invite" resetOnSuccess className="form-2 align-end">
          <div className="field"><label htmlFor="inv-email">Email</label><input id="inv-email" name="email" type="email" className="input" required /></div>
          <div className="field"><label htmlFor="inv-role">Role</label><RoleSelect id="inv-role" /></div>
        </ActionForm>
        <ul className="plain-list hint" style={{ marginTop: 12 }}>
          {Object.entries(ROLE_HELP).map(([r, t]) => <li key={r}><strong>{r}</strong>: {t}</li>)}
        </ul>
        <p className="hint">After inviting, the person opens <code>/admin/login</code> and asks for a sign-in link with that email.</p>
      </section>

      {team.invites.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Waiting to sign in</h2>
          <table className="table">
            <tbody>
              {team.invites.map((i) => (
                <tr key={i.email}><td>{i.email}</td><td>{i.role}</td><td className="hint">invited {formatDate(i.created_at)}</td>
                  <td><ActionButton action={cancelInvite.bind(null, i.email)} className="btn btn-ghost btn-sm">Cancel invite</ActionButton></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Staff</h2>
        {team.staff.map((m) => (
          <div key={m.user_id} className="team-row">
            <div><strong>{m.email}</strong>{m.user_id === staff.user_id && <span className="hint"> (you)</span>}
              <div className="hint">since {formatDate(m.created_at)}</div></div>
            <ActionForm action={updateStaff.bind(null, m.user_id)} submitLabel="Save" submitClass="btn btn-ghost btn-sm" className="row-gap">
              <label className="sr-only" htmlFor={`role-${m.user_id}`}>Role</label>
              <RoleSelect id={`role-${m.user_id}`} value={m.role} />
              <label className="check"><input type="checkbox" name="active" defaultChecked={m.is_active} /> Active</label>
            </ActionForm>
          </div>
        ))}
      </section>
    </>
  );
}
