import { requireStaff } from '../../../../lib/server/auth.js';
import { formatDate } from '../../../../components/admin/ui.js';

export const metadata = { title: 'Audit log' };

// Shows which fields changed between before and after.
function changes(before, after) {
  if (!before) return 'created';
  if (!after) return 'deleted';
  return Object.keys(after).filter((k) => k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`).join('; ');
}

export default async function AuditPage() {
  const staff = await requireStaff(['admin']);
  const { data: rows, error } = await staff.supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const { data: team } = await staff.supabase.from('staff').select('user_id, email');
  const who = new Map((team ?? []).map((t) => [t.user_id, t.email]));

  return (
    <>
      <h1 className="admin-h1">Audit log</h1>
      <p className="hint">Every change made by staff: who, what, when, before and after. Latest 200.</p>
      {rows.length === 0 ? <p className="empty">No staff changes yet.</p> : (
        <div className="table-wrap">
          <table className="table audit">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDate(r.created_at)}</td>
                  <td>{who.get(r.actor_id) ?? r.actor_id}<div className="hint">{r.actor_role}</div></td>
                  <td>{r.action} {r.table_name}<div className="hint">{r.row_id}</div></td>
                  <td className="audit-change">{changes(r.before, r.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
