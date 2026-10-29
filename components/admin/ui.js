// Small presentational helpers shared by admin pages (server-safe).
import { formatDate, formatTaka } from '../../lib/format.js';
import { formatBdPhone } from '../../lib/phone.js';

export const STATUS_LABEL = {
  pending: 'Pending', confirmed: 'Confirmed', dispatched: 'Dispatched',
  delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned',
};

export function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Stat({ label, value, tone, href }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </>
  );
  return href
    ? <a href={href} className={`stat ${tone ?? ''}`}>{body}</a>
    : <div className={`stat ${tone ?? ''}`}>{body}</div>;
}

export { formatDate, formatTaka, formatBdPhone };
