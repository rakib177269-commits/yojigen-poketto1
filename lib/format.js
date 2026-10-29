const taka = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

// 1450 -> "৳1,450"
export function formatTaka(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  return `৳${taka.format(Number(amount))}`;
}

export function discountPercent(price, compareAt) {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  });
}
