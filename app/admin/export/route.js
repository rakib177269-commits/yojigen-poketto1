// CSV export of orders (admin only; the database refuses other roles too).
import { getStaff } from '../../../lib/server/auth.js';

const COLUMNS = ['code', 'created_at', 'status', 'marketing_status', 'source', 'name', 'phone', 'address', 'zone',
  'items', 'subtotal', 'discount', 'delivery_fee', 'total', 'coupon', 'note'];

// Quote every cell; neutralise spreadsheet formulas (=, +, -, @) in text.
const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(request) {
  const staff = await getStaff();
  if (!staff) return new Response('Sign in first', { status: 401 });
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from')) ? url.searchParams.get('from') : today.slice(0, 8) + '01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to')) ? url.searchParams.get('to') : today;
  const { data, error } = await staff.supabase.rpc('admin_export_orders', { p_from: from, p_to: to });
  if (error) return new Response(error.message === 'not_allowed' ? 'Admins only' : 'Export failed', { status: 403 });
  const csv = [COLUMNS.join(','), ...data.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))].join('\r\n');
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${from}-to-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
