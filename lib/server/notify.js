// Customer and staff messages: SMS (BulkSMSBD or Alpha SMS) and email (Resend).
// Keys are server-only secrets. Messages are queued by the database (see
// migration 0020) and sent from here; nothing is sent twice.
import { supabaseService } from './supabase.js';
import { SITE } from '../site.js';
import { formatTaka } from '../format.js';

const TIMEOUT_MS = 10_000;

export function smsConfigured() {
  const p = process.env.SMS_PROVIDER;
  if (!process.env.SMS_API_KEY) return false;
  if (p === 'bulksmsbd') return Boolean(process.env.SMS_SENDER_ID);
  return p === 'alpha';
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function notifyStatus() {
  return { sms: smsConfigured(), smsProvider: process.env.SMS_PROVIDER || null, email: emailConfigured() };
}

async function request(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* some providers answer plain text */ }
    return { status: res.status, ok: res.ok, data, text: text.slice(0, 300) };
  } catch (err) {
    return { status: 0, ok: false, data: null, text: err.name === 'TimeoutError' ? 'timeout' : 'network error' };
  }
}

// phone: 8801XXXXXXXXX. Returns { ok, error }.
export async function sendSms(phone, text) {
  if (!smsConfigured()) return { ok: false, error: 'SMS is not set up' };
  if (process.env.SMS_PROVIDER === 'bulksmsbd') {
    const q = new URLSearchParams({
      api_key: process.env.SMS_API_KEY, type: 'text', number: phone,
      senderid: process.env.SMS_SENDER_ID, message: text,
    });
    const r = await request(`https://bulksmsbd.net/api/smsapi?${q}`, { method: 'GET' });
    const code = Number(r.data?.response_code);
    return code === 202 ? { ok: true } : { ok: false, error: r.data?.error_message || r.data?.success_message || r.text || `HTTP ${r.status}` };
  }
  // Alpha SMS (sms.net.bd)
  const body = new URLSearchParams({ api_key: process.env.SMS_API_KEY, msg: text, to: phone });
  if (process.env.SMS_SENDER_ID) body.set('sender_id', process.env.SMS_SENDER_ID);
  const r = await request('https://api.sms.net.bd/sendsms', { method: 'POST', body });
  return r.data?.error === 0 ? { ok: true } : { ok: false, error: r.data?.msg || r.text || `HTTP ${r.status}` };
}

export async function sendEmail(to, subject, html, text) {
  if (!emailConfigured()) return { ok: false, error: 'Email is not set up' };
  const r = await request('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html, text, reply_to: process.env.EMAIL_REPLY_TO || undefined }),
  });
  return r.ok && r.data?.id ? { ok: true } : { ok: false, error: r.data?.message || r.text || `HTTP ${r.status}` };
}

// ---------------------------------------------------------------- templates
// SMS in plain English/ASCII ("Tk", not "৳"): a Bangla or symbol SMS is billed
// as 2–3 messages. Each stays under 160 characters.
const tk = (n) => `Tk ${Number(n).toLocaleString('en-US')}`;
const trackUrl = `${SITE.url}/track`;

export function smsText(kind, o) {
  switch (kind) {
    case 'placed': return `Yojigen Poketto: Order ${o.code} received, ${tk(o.total)} cash on delivery. We'll call to confirm. Track: ${trackUrl}`;
    case 'confirmed': return `Yojigen Poketto: Order ${o.code} is confirmed and will be sent soon. Pay ${tk(o.total)} on delivery.`;
    case 'dispatched': return `Yojigen Poketto: Order ${o.code} is on its way${o.consignment_id ? ` (Pathao ${o.consignment_id})` : ''}. Keep ${tk(o.total)} ready. Track: ${trackUrl}`;
    case 'delivered': return `Yojigen Poketto: Order ${o.code} delivered. Thank you for shopping with us!`;
    case 'cancelled': return `Yojigen Poketto: Order ${o.code} was cancelled. Questions? Call ${SITE.phone}.`;
    default: return null;
  }
}

export const otpText = (code) => `Your Yojigen Poketto sign-in code is ${code}. It expires in 5 minutes. Never share it.`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const HEADLINE = {
  placed: ['We received your order', 'Thank you! We will call you shortly to confirm it. You pay in cash when it arrives.'],
  confirmed: ['Your order is confirmed', 'We are packing it now and will send it soon.'],
  dispatched: ['Your order is on its way', 'It is with our courier. Please keep the cash ready.'],
  delivered: ['Your order was delivered', 'We hope you love it. Thank you for shopping with us!'],
  cancelled: ['Your order was cancelled', 'If this is a surprise, please call or WhatsApp us.'],
  staff_new_order: ['New order', 'A customer placed a new order. Confirm it in the admin panel.'],
};

function itemsTable(o) {
  const rows = (o.items ?? []).map((i) => `<tr><td style="padding:6px 0">${esc(i.title)}${i.variant_name ? ` <span style="color:#667">(${esc(i.variant_name)})</span>` : ''} × ${i.quantity}</td><td style="padding:6px 0;text-align:right">${esc(formatTaka(i.line_total))}</td></tr>`).join('');
  const line = (label, value, bold) => `<tr><td style="padding:4px 0;${bold ? 'font-weight:700' : 'color:#556'}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? 'font-weight:700' : ''}">${esc(value)}</td></tr>`;
  return `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">${rows}
    <tr><td colspan="2" style="border-top:1px solid #e3e6ef;padding-top:6px"></td></tr>
    ${line('Subtotal', formatTaka(o.subtotal))}
    ${o.discount ? line(`Discount${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}`, `−${formatTaka(o.discount)}`) : ''}
    ${line('Delivery', formatTaka(o.delivery_fee))}
    ${line('Pay on delivery', formatTaka(o.total), true)}</table>`;
}

export function emailFor(kind, o) {
  const head = HEADLINE[kind];
  if (!head) return null;
  const staff = kind === 'staff_new_order';
  const subject = staff ? `New order ${o.code} · ${tk(o.total)} · ${o.name}` : `${head[0]} · ${o.code}`;
  const details = staff
    ? `<p style="margin:0 0 12px">${esc(o.name)} · +${esc(o.phone)}<br>${esc(o.address)}${o.note ? `<br><em>Note: ${esc(o.note)}</em>` : ''}</p>
       <p><a href="${SITE.url}/admin/orders?q=${encodeURIComponent(o.code)}" style="color:#1a3aa8">Open in admin</a></p>`
    : `<p style="margin:0 0 12px">Delivery: ${esc(o.zone?.name ?? '')}${o.zone?.eta ? ` · ${esc(o.zone.eta)}` : ''}</p>
       <p><a href="${SITE.url}/order/${encodeURIComponent(o.code)}" style="color:#1a3aa8">View your order</a></p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f1630">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <p style="font-family:Georgia,serif;font-size:22px;color:#0e1f5b;margin:0 0 16px">Yojigen Poketto</p>
  <div style="background:#fff;border-radius:12px;padding:20px">
    <h1 style="font-size:20px;margin:0 0 6px">${esc(head[0])}</h1>
    <p style="margin:0 0 4px;color:#445">${esc(head[1])}</p>
    <p style="margin:0 0 16px;color:#667">Order <strong>${esc(o.code)}</strong></p>
    ${itemsTable(o)}
    ${details}
  </div>
  <p style="font-size:12px;color:#778;margin:16px 0 0">Questions? Call or WhatsApp ${esc(SITE.phone)}. ${esc(SITE.url.replace(/^https:\/\//, ''))}</p>
</div></body></html>`;
  const text = `${head[0]} (${o.code})\n${head[1]}\n\n${(o.items ?? []).map((i) => `${i.title}${i.variant_name ? ` (${i.variant_name})` : ''} x${i.quantity}: ${tk(i.line_total)}`).join('\n')}\nTotal (pay on delivery): ${tk(o.total)}\n\n${staff ? `${o.name}, +${o.phone}\n${o.address}` : `${SITE.url}/order/${o.code}`}`;
  return { subject, html, text };
}

// ---------------------------------------------------------------- outbox
// Sends queued messages (all, or one order's right after it changed).
export async function processOutbox({ orderId = null, limit = 50 } = {}) {
  const db = supabaseService();
  const { data: rows, error } = await db.rpc('notify_claim', { p_limit: limit, p_order_id: orderId });
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const n of rows) {
    let r;
    if (n.channel === 'sms') {
      const text = smsText(n.kind, n.order);
      r = !text ? { skip: 'no template' } : !smsConfigured() ? { skip: 'SMS not set up' } : await sendSms(n.recipient, text);
    } else {
      const mail = emailFor(n.kind, n.order);
      r = !mail ? { skip: 'no template' } : !emailConfigured() ? { skip: 'email not set up' } : await sendEmail(n.recipient, mail.subject, mail.html, mail.text);
    }
    const status = r.skip ? 'skipped' : r.ok ? 'sent' : 'failed';
    if (status === 'sent') sent += 1;
    await db.rpc('notify_finish', { p_id: n.id, p_status: status, p_error: r.skip ?? r.error ?? null });
  }
  return { processed: rows.length, sent };
}

// For after(): never throws, so a messaging problem can't break an order.
export async function kickOutbox(orderId) {
  try {
    await processOutbox({ orderId, limit: 10 });
  } catch (err) {
    console.error('notify: immediate send failed (the 5-minute sweep will retry):', err.message);
  }
}
