// Marketing events from the browser. Phase 6 wires this to the Meta Pixel and
// our /api/capi mirror (same event_id). Until then it is a deliberate no-op,
// so components can already call it. Purchase is NEVER sent from here.
export function track(eventName, data = {}) {
  if (typeof window === 'undefined' || eventName === 'Purchase') return;
  window.__ypTrack?.(eventName, data);
}
