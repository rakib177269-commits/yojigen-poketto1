import Link from 'next/link';
import { requireStaff, can } from '../../../lib/server/auth.js';
import { signOut } from '../../../lib/admin/auth-actions.js';

export default async function PanelLayout({ children }) {
  const staff = await requireStaff();
  const r = staff.role;
  const nav = [
    can.dashboard(r) && ['/admin', 'Dashboard'],
    ['/admin/orders', 'Orders'],
    can.edit(r) && ['/admin/orders/new', 'New order'],
    can.abandoned(r) && ['/admin/abandoned', 'Abandoned carts'],
    can.team(r) && ['/admin/team', 'Team'],
    can.settings(r) && ['/admin/settings', 'Settings'],
    can.audit(r) && ['/admin/audit', 'Audit log'],
    ['/admin/account', 'My account'],
  ].filter(Boolean);

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link href="/admin" className="admin-brand">Yojigen Poketto <span>Admin</span></Link>
        <nav aria-label="Admin">
          {nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <div className="admin-who">
          <div>{staff.email}</div>
          <span className={`role role-${r}`}>{r}</span>
          <form action={signOut}><button className="linklike" type="submit">Sign out</button></form>
          <Link href="/" target="_blank" className="linklike">View shop ↗</Link>
        </div>
      </aside>
      <main className="admin-main" id="main">{children}</main>
    </div>
  );
}
