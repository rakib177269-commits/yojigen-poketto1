// Bangladeshi phone numbers. Mirrors private.normalize_bd_phone in the database
// (supabase/migrations/0002_core_rpcs.sql) - keep the two in sync.

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

// Bangla digits -> ASCII. Must run BEFORE stripping non-digits: a plain
// replace(/\D/g, '') deletes Bangla digits and the customer can't check out.
export function bnToAsciiDigits(value) {
  return String(value ?? '').replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

// Returns the canonical 8801XXXXXXXXX form, or null if it isn't a valid BD mobile.
export function normalizeBdPhone(value) {
  let d = bnToAsciiDigits(value).replace(/\D/g, '');
  if (/^008801[3-9]\d{8}$/.test(d)) d = d.slice(2);
  if (/^8801[3-9]\d{8}$/.test(d)) return d;
  if (/^01[3-9]\d{8}$/.test(d)) return `88${d}`;
  if (/^1[3-9]\d{8}$/.test(d)) return `880${d}`;
  return null;
}

// 8801712345678 -> 01712-345678 (how people in Bangladesh write it)
export function formatBdPhone(normalized) {
  if (!normalized) return '';
  const local = normalized.slice(2);
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}
