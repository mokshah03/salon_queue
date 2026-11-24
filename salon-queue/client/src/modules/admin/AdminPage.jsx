import { useState } from 'react';
import { api } from '../../services/api.js';
import { usePolling } from '../../hooks/usePolling.js';
import { Alert, ConfirmDialog, Field, Modal, Spinner, StateMessage, StatusBadge } from '../../components/ui.jsx';
import { formatDuration, formatINR, formatTime, servicesSummary, STYLIST_STATUS_LABEL } from '../../utils/format.js';
import './admin.css';

const TABS = [['overview', 'Overview'], ['services', 'Services'], ['stylists', 'Stylists']];

// ------------------------------------------------------------------ forms
function ServiceForm({ initial, categories, onClose, onSaved }) {
  const [f, setF] = useState(
    initial
      ? { ...initial, price: String(initial.price), durationMinutes: String(initial.durationMinutes) }
      : { name: '', category: categories[0] || 'Hair Services', description: '', price: '', durationMinutes: '', available: true }
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = 'Enter a service name.';
    const price = Number(f.price);
    if (f.price.trim() === '' || !Number.isFinite(price) || price < 0) er.price = 'Enter a price of 0 or more.';
    const dur = Number(f.durationMinutes);
    if (f.durationMinutes.trim() === '' || !Number.isInteger(dur) || dur < 5 || dur > 480) er.durationMinutes = 'Whole minutes, 5 to 480.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    setError('');
    try {
      const body = { name: f.name, category: f.category, description: f.description, price, durationMinutes: dur, available: f.available };
      if (initial) await api.put(`/admin/services/${initial.id}`, body);
      else await api.post('/admin/services', body);
      onSaved(initial ? 'Service updated' : 'Service added');
    } catch (err) {
      setError(err.message);
      if (err.data?.errors) setErrors(err.data.errors);
      setSaving(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit service' : 'Add service'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <Alert type="error">{error}</Alert>
        <Field label="Name" error={errors.name}><input value={f.name} onChange={set('name')} maxLength={80} /></Field>
        <Field label="Category" error={errors.category}>
          <select value={f.category} onChange={set('category')}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Description" error={errors.description}><textarea value={f.description} onChange={set('description')} maxLength={300} /></Field>
        <div className="grid2">
          <Field label="Price (₹)" error={errors.price}><input inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
          <Field label="Duration (min)" error={errors.durationMinutes}><input inputMode="numeric" value={f.durationMinutes} onChange={set('durationMinutes')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.available} onChange={set('available')} /> Available to customers</label>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save service'}</button>
        </div>
      </form>
    </Modal>
  );
}

function StylistForm({ initial, services, onClose, onSaved }) {
  const [f, setF] = useState(
    initial
      ? { name: initial.name, specialties: initial.specialties.join(', '), status: initial.status, serviceIds: initial.serviceIds }
      : { name: '', specialties: '', status: 'AVAILABLE', serviceIds: [] }
  );
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const toggle = (id) => setF((s) => ({ ...s, serviceIds: s.serviceIds.includes(id) ? s.serviceIds.filter((x) => x !== id) : [...s.serviceIds, id] }));

  const submit = async (e) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return setErrors({ name: 'Enter a name.' });
    setSaving(true);
    setError('');
    try {
      const body = { name: f.name, status: f.status, serviceIds: f.serviceIds, specialties: f.specialties.split(',').map((s) => s.trim()).filter(Boolean) };
      const res = initial ? await api.put(`/admin/stylists/${initial.id}`, body) : await api.post('/admin/stylists', body);
      onSaved(initial ? `Stylist updated${res.reassignedCustomers ? ` · ${res.reassignedCustomers} waiting customer(s) moved to any stylist` : ''}` : 'Stylist added');
    } catch (err) {
      setError(err.message);
      if (err.data?.errors) setErrors(err.data.errors);
      setSaving(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit stylist' : 'Add stylist'} onClose={onClose} wide>
      <form onSubmit={submit} noValidate>
        <Alert type="error">{error}</Alert>
        <div className="grid2">
          <Field label="Name" error={errors.name}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} /></Field>
          <Field label="Availability" error={errors.status}>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {Object.entries(STYLIST_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Specialties" error={errors.specialties} hint="Comma separated, e.g. Hair colour, Styling"><input value={f.specialties} onChange={(e) => setF({ ...f, specialties: e.target.value })} /></Field>
        <div className="field">
          <span className="field__label">Services this stylist performs</span>
          <span className="field__hint">Leave all unticked to allow every service.</span>
          <div className="svc-pick">
            {services.map((s) => (
              <label key={s.id} className="check">
                <input type="checkbox" checked={f.serviceIds.includes(s.id)} onChange={() => toggle(s.id)} /> {s.name} <span className="muted small">({s.category})</span>
              </label>
            ))}
          </div>
          {errors.serviceIds && <span className="field__error">{errors.serviceIds}</span>}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save stylist'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ page
export default function AdminPage() {
  const [tab, setTab] = useState('overview');
  const overview = usePolling(() => api.get('/admin/overview'), 5000);
  const catalog = usePolling(() => api.get('/services'), 5000);
  const stylistList = usePolling(() => api.get('/stylists'), 5000);
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null); // {type:'service'|'stylist', item?}
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const services = catalog.data?.services || [];
  const categories = catalog.data?.categories || [];
  const stylists = stylistList.data?.stylists || [];
  const sum = overview.data?.summary;

  const refreshAll = () => {
    overview.refresh();
    catalog.refresh();
    stylistList.refresh();
  };
  const saved = (text) => {
    setModal(null);
    setNotice({ type: 'success', text });
    refreshAll();
  };
  const attempt = async (fn, okText) => {
    setBusy(true);
    try {
      const res = await fn();
      setNotice({ type: 'success', text: typeof okText === 'function' ? okText(res) : okText });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
      setConfirm(null);
      refreshAll();
    }
  };

  const toggleAvail = (s) => attempt(() => api.patch(`/admin/services/${s.id}/availability`, { available: !s.available }), `${s.name} is now ${s.available ? 'unavailable' : 'available'}`);
  const setStatus = (st, status) => attempt(() => api.patch(`/admin/stylists/${st.id}/status`, { status }), `${st.name}: ${STYLIST_STATUS_LABEL[status].toLowerCase()}`);
  const deleteService = (s) =>
    setConfirm({
      title: `Delete ${s.name}?`,
      message: 'This removes the service for good. Existing queue history keeps its price/duration snapshot. If customers are queued for it, deletion is blocked — mark it unavailable instead.',
      label: 'Delete service',
      run: () => attempt(() => api.del(`/admin/services/${s.id}`), 'Service deleted'),
    });
  const deleteStylist = (st) =>
    setConfirm({
      title: `Delete ${st.name}?`,
      message: 'Waiting customers who requested this stylist will be switched to "any available stylist". Deletion is blocked while they have a called or in-service customer.',
      label: 'Delete stylist',
      run: () => attempt(() => api.del(`/admin/stylists/${st.id}`), (r) => `Stylist deleted${r.reassignedCustomers ? ` · ${r.reassignedCustomers} waiting customer(s) moved to any stylist` : ''}`),
    });

  const loadingFirst = overview.loading && !overview.data;

  return (
    <div className="admin">
      <header className="admin__head">
        <div>
          <h1>Salon admin</h1>
          <div className="muted">Demo access · {overview.data?.date || '…'}</div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' tab--on' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
      </header>

      {overview.error && overview.data && <Alert type="warn">Connection problem — showing the last update. Retrying…</Alert>}
      {notice && <Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      {loadingFirst && <Spinner label="Loading dashboard…" />}
      {overview.error && !overview.data && (
        <StateMessage title="Couldn't load the dashboard" action={<button className="btn btn--primary" onClick={refreshAll}>Try again</button>}>{overview.error.message}</StateMessage>
      )}

      {sum && (
        <section className="summary" aria-label="Today's summary">
          {[
            ['Checked in today', sum.checkedIn],
            ['Currently waiting', sum.waiting],
            ['Being served', sum.serving],
            ['Completed', sum.completed],
            ['Average wait', sum.averageWaitMinutes == null ? '—' : `${sum.averageWaitMinutes} min`],
            ['Most popular', sum.mostPopularService ? sum.mostPopularService.name : '—'],
          ].map(([label, value]) => (
            <div key={label} className="card stat-card">
              <div className="muted small">{label}</div>
              <div className={`stat-card__value${String(value).length > 8 ? ' stat-card__value--text' : ''}`}>{value}</div>
            </div>
          ))}
        </section>
      )}

      {overview.data && tab === 'overview' && (
        <>
          <section className="card">
            <h3>Stylist availability</h3>
            {!overview.data.stylists.length && <p className="muted">No stylists yet. Add one in the Stylists tab.</p>}
            <div className="monitor">
              {overview.data.stylists.map((s) => (
                <div key={s.id} className={`monitor__item monitor__item--${s.status}`}>
                  <b>{s.name}</b>
                  <span className="muted small">{s.current ? `${s.current.status === 'CALLED' ? 'Called' : 'Serving'} ${s.current.token}` : 'Free'}</span>
                  <select aria-label={`Availability of ${s.name}`} value={s.status} disabled={busy} onChange={(e) => setStatus(s, e.target.value)}>
                    {Object.entries(STYLIST_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <h3>Today's queue</h3>
            {!overview.data.queue.length ? (
              <p className="muted">No customers have checked in today.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Token</th><th>Customer</th><th>Service</th><th>Stylist</th><th>Status</th><th>Checked in</th><th>Wait</th></tr></thead>
                  <tbody>
                    {overview.data.queue.map((e) => (
                      <tr key={e.id}>
                        <td><b>{e.token}</b></td>
                        <td>{e.customerName}<div className="muted small">{e.phone}</div></td>
                        <td>{servicesSummary(e.services)}</td>
                        <td>{(e.assignedStylist || e.preferredStylist)?.name || 'Any'}</td>
                        <td><StatusBadge status={e.status} /></td>
                        <td>{formatTime(e.checkedInAt)}</td>
                        <td>{e.status === 'WAITING' ? (e.wait?.available ? `~${e.wait.minutes} min` : 'n/a') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'services' && (
        <section className="card">
          <div className="row row--between"><h3>Services</h3><button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'service' })}>+ Add service</button></div>
          {catalog.loading && !catalog.data && <Spinner />}
          {catalog.data && !services.length && <p className="muted">No services yet. Add your first service.</p>}
          {services.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Service</th><th>Category</th><th>Price</th><th>Duration</th><th>Available</th><th /></tr></thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.name}</b><div className="muted small">{s.description}</div></td>
                      <td>{s.category}</td>
                      <td>{formatINR(s.price)}</td>
                      <td>{formatDuration(s.durationMinutes)}</td>
                      <td>
                        <button className={`switch${s.available ? ' switch--on' : ''}`} role="switch" aria-checked={s.available} aria-label={`${s.name} availability`} disabled={busy} onClick={() => toggleAvail(s)}><span /></button>
                      </td>
                      <td className="actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => setModal({ type: 'service', item: s })}>Edit</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => deleteService(s)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'stylists' && (
        <section className="card">
          <div className="row row--between"><h3>Stylists</h3><button className="btn btn--primary btn--sm" onClick={() => setModal({ type: 'stylist' })}>+ Add stylist</button></div>
          {stylistList.loading && !stylistList.data && <Spinner />}
          {stylistList.data && !stylists.length && <p className="muted">No stylists yet. Add your first stylist.</p>}
          {stylists.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Specialties</th><th>Services</th><th>Availability</th><th /></tr></thead>
                <tbody>
                  {stylists.map((s) => (
                    <tr key={s.id}>
                      <td><b>{s.name}</b></td>
                      <td>{s.specialties.length ? s.specialties.join(', ') : <span className="muted">—</span>}</td>
                      <td>
                        {s.serviceIds.length ? (
                          <span title={s.serviceIds.map((id) => services.find((x) => x.id === id)?.name).filter(Boolean).join(', ')}>{s.serviceIds.length} assigned</span>
                        ) : <span className="muted">All services</span>}
                      </td>
                      <td>
                        <select className="input input--sm" aria-label={`Availability of ${s.name}`} value={s.status} disabled={busy} onChange={(e) => setStatus(s, e.target.value)}>
                          {Object.entries(STYLIST_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td className="actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => setModal({ type: 'stylist', item: s })}>Edit</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => deleteStylist(s)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modal?.type === 'service' && <ServiceForm initial={modal.item} categories={categories} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.type === 'stylist' && <StylistForm initial={modal.item} services={services} onClose={() => setModal(null)} onSaved={saved} />}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger busy={busy} onConfirm={confirm.run} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
