import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { usePolling } from '../../hooks/usePolling.js';
import { Alert, ConfirmDialog, Spinner, StateMessage, StatusBadge } from '../../components/ui.jsx';
import { formatDuration, formatTime, STYLIST_STATUS_LABEL, servicesSummary } from '../../utils/format.js';
import './staff.css';

const ACTING_KEY = 'salonQueue.actingAs';

function Card({ e, busy, onAction, children }) {
  const stylist = e.assignedStylist || e.preferredStylist;
  return (
    <article className={`qcard${e.overdue ? ' qcard--overdue' : ''}`}>
      <div className="row row--between">
        <strong className="qcard__token">{e.token}</strong>
        <StatusBadge status={e.status} />
      </div>
      <div className="qcard__name">{e.customerName} <span className="muted">· {e.phone}</span></div>
      <div className="qcard__svc">{servicesSummary(e.services)} <span className="muted">· {formatDuration(e.totalDurationMinutes)}</span></div>
      <div className="qcard__meta">
        <span>Stylist: <b>{stylist ? stylist.name : 'Any'}</b>{!e.assignedStylist && e.preferredStylist ? ' (preferred)' : ''}</span>
        <span>In: {formatTime(e.checkedInAt)}</span>
        {e.status === 'IN_SERVICE' ? (
          <span>In service {e.elapsedMinutes} / {e.totalDurationMinutes} min</span>
        ) : (
          <span>Waiting {e.waitedMinutes} min</span>
        )}
      </div>
      {e.overdue && (
        <div className="qcard__warn">
          ⚠ Waiting longer than {e.estimatedWaitAtCheckIn != null ? `the ${e.estimatedWaitAtCheckIn} min estimate` : 'expected'}
        </div>
      )}
      <div className="qcard__actions">{typeof children === 'function' ? children({ busy, onAction }) : children}</div>
    </article>
  );
}

export default function StaffQueuePage() {
  const [filters, setFilters] = useState({ service: '', stylist: '', search: '' });
  const [debounced, setDebounced] = useState('');
  const [actingAs, setActingAs] = useState(() => localStorage.getItem(ACTING_KEY) || '');
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters.search), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const qs = new URLSearchParams(
    Object.entries({ service: filters.service, stylist: filters.stylist, search: debounced }).filter(([, v]) => v)
  ).toString();
  const board = usePolling(() => api.get(`/staff/queue${qs ? `?${qs}` : ''}`), 4000, qs);
  const catalog = usePolling(() => api.get('/services'), 15000);
  const settings = usePolling(() => api.get('/settings'), 30000);

  const data = board.data;
  const stylists = data?.stylists || [];

  useEffect(() => {
    // forget a stored stylist that no longer exists
    if (data && actingAs && !stylists.some((s) => s.id === actingAs)) setActingAs('');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseActing = (v) => {
    setActingAs(v);
    localStorage.setItem(ACTING_KEY, v);
  };

  async function run(key, fn, okText) {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      if (okText) setNotice({ type: 'success', text: okText });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusy(null);
      setConfirm(null);
      board.refresh();
    }
  }

  const act = (e, action, okText) => run(e.id, () => api.post(`/staff/queue/${e.id}/${action}`), okText);
  const callNext = () =>
    run('call', async () => {
      const { entry } = await api.post('/staff/call-next', { stylistId: actingAs || null });
      setNotice({ type: 'success', text: `Called ${entry.token} (${entry.customerName})${entry.assignedStylist ? ` for ${entry.assignedStylist.name}` : ''}` });
    });
  const setStylistStatus = (s, status) => run(`st-${s.id}`, () => api.patch(`/staff/stylists/${s.id}/status`, { status }));

  const ask = (title, message, confirmLabel, fn, danger = true) => setConfirm({ title, message, confirmLabel, fn, danger });

  const c = data?.counts;
  const sec = data?.sections;
  const filtered = filters.service || filters.stylist || debounced;

  return (
    <div className="staff">
      <header className="staff__head">
        <div>
          <h1>Reception queue</h1>
          <div className="muted">
            {data?.date || '…'} · Salon {settings.data ? (settings.data.isOpen ? 'open' : 'closed') : '…'}
          </div>
        </div>
        <div className="counts">
          <span><b>{c?.waiting ?? '–'}</b> waiting</span>
          <span><b>{c?.called ?? '–'}</b> called</span>
          <span><b>{c?.inService ?? '–'}</b> in service</span>
          <span><b>{c?.completed ?? '–'}</b> completed</span>
        </div>
      </header>

      {board.error && data && <Alert type="warn">Connection problem — showing the last update. Retrying…</Alert>}
      {notice && <Alert type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <section className="staff__controls card">
        <div className="callbox">
          <label className="field callbox__field">
            <span className="field__label">Calling for</span>
            <select value={actingAs} onChange={(e) => chooseActing(e.target.value)}>
              <option value="">Reception (auto-pick free stylist)</option>
              {stylists.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({STYLIST_STATUS_LABEL[s.status]})</option>
              ))}
            </select>
          </label>
          <button className="btn btn--primary btn--lg" onClick={callNext} disabled={!!busy || !data}>
            {busy === 'call' ? 'Calling…' : 'Call Next Customer'}
          </button>
        </div>
        <div className="filters">
          <input className="input" type="search" placeholder="Search token or name" aria-label="Search token or name" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <select className="input" aria-label="Filter by service" value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}>
            <option value="">All services</option>
            {(catalog.data?.services || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" aria-label="Filter by stylist" value={filters.stylist} onChange={(e) => setFilters({ ...filters, stylist: e.target.value })}>
            <option value="">All stylists</option>
            {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {filtered && <button className="btn btn--ghost btn--sm" onClick={() => { setFilters({ service: '', stylist: '', search: '' }); setDebounced(''); }}>Clear filters</button>}
        </div>
      </section>

      <section className="stylist-strip" aria-label="Stylist availability">
        {stylists.map((s) => (
          <div key={s.id} className={`stylist-chip stylist-chip--${s.status}`}>
            <b>{s.name}</b>
            <span className="muted small">{s.current ? `${s.current.status === 'CALLED' ? 'Called' : 'Serving'} ${s.current.token}` : 'Free'}</span>
            <select aria-label={`Availability of ${s.name}`} value={s.status} disabled={busy === `st-${s.id}`} onChange={(e) => setStylistStatus(s, e.target.value)}>
              {Object.entries(STYLIST_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
      </section>

      {board.loading && !data && <Spinner label="Loading queue…" />}
      {board.error && !data && (
        <StateMessage title="Couldn't load the queue" action={<button className="btn btn--primary" onClick={board.refresh}>Try again</button>}>{board.error.message}</StateMessage>
      )}

      {data && (
        <div className="board">
          <div className="col">
            <h2>WAITING <span className="count">{sec.waiting.length}</span></h2>
            {!sec.waiting.length && <p className="empty">{filtered ? 'No waiting customers match.' : 'No one is waiting.'}</p>}
            {sec.waiting.map((e) => (
              <Card key={e.id} e={e}>
                <button className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => ask(`Cancel ${e.token}?`, `${e.customerName} will be removed from the queue.`, 'Cancel entry', () => act(e, 'cancel', `${e.token} cancelled`))}>Cancel</button>
              </Card>
            ))}
          </div>
          <div className="col">
            <h2>CALLED <span className="count">{sec.called.length}</span></h2>
            {!sec.called.length && <p className="empty">No one has been called.</p>}
            {sec.called.map((e) => (
              <Card key={e.id} e={e}>
                <button className="btn btn--primary btn--sm" disabled={!!busy} onClick={() => act(e, 'start', `Started service for ${e.token}`)}>Start Service</button>
                <button className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => ask(`Mark ${e.token} as no-show?`, `${e.customerName} did not respond to the call.`, 'Mark no-show', () => act(e, 'no-show', `${e.token} marked no-show`))}>Mark No Show</button>
              </Card>
            ))}
          </div>
          <div className="col">
            <h2>IN SERVICE <span className="count">{sec.inService.length}</span></h2>
            {!sec.inService.length && <p className="empty">No services in progress.</p>}
            {sec.inService.map((e) => (
              <Card key={e.id} e={e}>
                <button className="btn btn--primary btn--sm" disabled={!!busy} onClick={() => act(e, 'complete', `${e.token} completed`)}>Complete Service</button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data && sec.noShow.length > 0 && (
        <section className="noshow card">
          <h3>No-shows today</h3>
          {sec.noShow.map((e) => (
            <div key={e.id} className="noshow__row">
              <span><b>{e.token}</b> {e.customerName} · {servicesSummary(e.services)}</span>
              <button className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => ask(`Return ${e.token} to the queue?`, `${e.customerName} will go back to WAITING at their original position.`, 'Return to Queue', () => act(e, 'return', `${e.token} returned to queue`), false)}>Return to Queue</button>
            </div>
          ))}
        </section>
      )}

      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} danger={confirm.danger} busy={!!busy} onConfirm={confirm.fn} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}
