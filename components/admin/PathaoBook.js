'use client';
// "Send to Pathao" on a confirmed order. Pathao reads the city/zone from the
// address; if it can't, choose them by hand below and send again.
import { useActionState, useEffect, useState } from 'react';
import { sendToPathao, pathaoLocations } from '../../lib/admin/courier-actions.js';

function Picker({ id, label, options, value, onChange, disabled }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id.replace('pa-', '')} className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{options ? 'Choose…' : '—'}</option>
        {(options ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

export default function PathaoBook({ orderId, defaultWeight }) {
  const [state, action, pending] = useActionState(sendToPathao.bind(null, orderId), null);
  const [manual, setManual] = useState(false);
  const [lists, setLists] = useState({});
  const [pick, setPick] = useState({ city: '', zone: '', area: '' });
  const [loadError, setLoadError] = useState(null);

  async function load(kind, parent) {
    const r = await pathaoLocations(kind, parent);
    if (r.error) setLoadError(r.error);
    else setLists((l) => ({ ...l, [kind]: r.data }));
  }
  function openManual() {
    setManual(true);
    if (!lists.cities) load('cities');
  }
  const showManual = manual || state?.needsArea;
  useEffect(() => {
    if (state?.needsArea && !lists.cities) load('cities');
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={action} className="form-grid">
      <div className="form-2">
        <div className="field"><label htmlFor="pa-weight">Parcel weight (kg)</label>
          <input id="pa-weight" name="weight" className="input" inputMode="decimal" defaultValue={defaultWeight} /></div>
        <div className="field"><label htmlFor="pa-instr">Note for the rider (optional)</label>
          <input id="pa-instr" name="instruction" className="input" maxLength={120} placeholder="e.g. call before coming" /></div>
      </div>
      {showManual ? (
        <fieldset className="fieldset">
          <legend>Delivery area in Pathao</legend>
          {loadError && <p className="error-text">{loadError}</p>}
          <div className="form-3">
            <Picker id="pa-city" label="City" options={lists.cities} value={pick.city}
              onChange={(v) => { setPick({ city: v, zone: '', area: '' }); setLists((l) => ({ ...l, zones: null, areas: null })); if (v) load('zones', v); }} />
            <Picker id="pa-zone" label="Zone" options={lists.zones} value={pick.zone} disabled={!pick.city}
              onChange={(v) => { setPick((p) => ({ ...p, zone: v, area: '' })); setLists((l) => ({ ...l, areas: null })); if (v) load('areas', v); }} />
            <Picker id="pa-area" label="Area (optional)" options={lists.areas} value={pick.area} disabled={!pick.zone}
              onChange={(v) => setPick((p) => ({ ...p, area: v }))} />
          </div>
        </fieldset>
      ) : (
        <button type="button" className="link-btn hint" style={{ justifySelf: 'start' }} onClick={openManual}>
          Choose Pathao city / zone by hand
        </button>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Sending to Pathao…' : 'Send to Pathao'}</button>
        {state?.error && <span className="error-text" role="alert">{state.error}</span>}
        {state?.ok && <span className="ok-text" role="status">{state.ok}</span>}
      </div>
    </form>
  );
}
