'use client';
// Remembers how the visitor arrived (landing URL, UTM tags, Facebook click id)
// so it can be stored on the order: purchase events are sent days later, after
// an operator confirms the order, when the browser is long gone.
import { useEffect } from 'react';

const KEY = 'yp_attr_v1';
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export default function Attribution() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      const fbclid = url.searchParams.get('fbclid');
      const utm = Object.fromEntries(UTM.filter((k) => url.searchParams.get(k)).map((k) => [k, url.searchParams.get(k).slice(0, 100)]));
      // Start a new attribution on the first visit or on any new ad click.
      if (!stored || fbclid || Object.keys(utm).length) {
        localStorage.setItem(KEY, JSON.stringify({
          landing_url: url.href.slice(0, 1000),
          utm: Object.keys(utm).length ? utm : stored?.utm ?? null,
          fbclid: fbclid ?? stored?.fbclid ?? null,
          fbclid_ts: fbclid ? Date.now() : stored?.fbclid_ts ?? null,
        }));
      }
    } catch {
      // storage blocked: attribution is optional
    }
  }, []);
  return null;
}

function cookie(name) {
  return document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1] ?? null;
}

// Values sent with the order. fbc follows Meta's format fb.1.<ms>.<fbclid>.
export function readAttribution() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* ignore */ }
  const fbc = cookie('_fbc') || (stored?.fbclid ? `fb.1.${stored.fbclid_ts || Date.now()}.${stored.fbclid}` : null);
  // GA4 client id is the last two parts of the _ga cookie (GA1.1.<id>.<time>).
  const ga = cookie('_ga')?.split('.').slice(-2).join('.') || null;
  return {
    fbp: cookie('_fbp'),
    fbc,
    landing_url: stored?.landing_url ?? null,
    utm: stored?.utm ?? null,
    // Kept with the order so the server can report the purchase to Google later.
    ids: { _ga: ga },
  };
}
