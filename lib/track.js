// Marketing events from the browser: forwarded to the Meta Pixel (+ our /api/capi
// server copy with the same event_id) and GA4 by components/Pixels.js. A no-op
// when no tracking id is set. Purchase is NEVER sent from here: the server
// reports it after an operator confirms the order (app/api/sweep/marketing).
export function track(eventName, data = {}) {
  if (typeof window === 'undefined' || eventName === 'Purchase') return;
  window.__ypTrack?.(eventName, data);
}
