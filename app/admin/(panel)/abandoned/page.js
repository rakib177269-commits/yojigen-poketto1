import { requireStaff } from '../../../../lib/server/auth.js';
import { updateAbandoned } from '../../../../lib/admin/actions.js';
import ActionButton from '../../../../components/admin/ActionButton.js';
import { formatDate, formatTaka, formatBdPhone } from '../../../../components/admin/ui.js';

export const metadata = { title: 'Abandoned carts' };

export default async function AbandonedPage({ searchParams }) {
  const staff = await requireStaff(['admin', 'manager', 'support']);
  const { status = 'open' } = await searchParams;
  const shown = ['open', 'contacted', 'recovered', 'dismissed'].includes(status) ? status : 'open';
  const { data: carts, error } = await staff.supabase.from('abandoned_carts')
    .select('*').eq('status', shown).order('updated_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message);

  return (
    <>
      <h1 className="admin-h1">Abandoned carts</h1>
      <p className="hint">Captured when a customer types a valid phone number at checkout but doesn’t place the order. Marked recovered automatically when they order.</p>
      <nav className="chips">
        {['open', 'contacted', 'recovered', 'dismissed'].map((s) => (
          <a key={s} className="chip" href={`/admin/abandoned?status=${s}`} aria-current={s === shown ? 'page' : undefined}>{s[0].toUpperCase() + s.slice(1)}</a>
        ))}
      </nav>
      {carts.length === 0 ? <p className="empty">Nothing here.</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Customer</th><th>Cart</th><th>Value</th><th></th></tr></thead>
            <tbody>
              {carts.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">{formatDate(c.updated_at)}</td>
                  <td>{c.name || '—'}<div><a href={`tel:+${c.phone}`}>{formatBdPhone(c.phone)}</a> · <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
                    {c.address && <div className="hint">{c.address}</div>}</td>
                  <td>{(c.items || []).map((i) => `${i.title}${i.variant_name ? ` (${i.variant_name})` : ''} × ${i.quantity}`).join(', ')}</td>
                  <td className="nowrap">{formatTaka(c.subtotal)}</td>
                  <td className="nowrap">
                    {shown === 'open' && <ActionButton action={updateAbandoned.bind(null, c.id, 'contacted')} className="btn btn-ghost btn-sm">Mark contacted</ActionButton>}
                    {['open', 'contacted'].includes(shown) && <ActionButton action={updateAbandoned.bind(null, c.id, 'dismissed')} className="btn btn-ghost btn-sm">Dismiss</ActionButton>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
