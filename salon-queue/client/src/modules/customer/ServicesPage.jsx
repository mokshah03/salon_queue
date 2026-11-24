import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { usePolling } from '../../hooks/usePolling.js';
import { Alert, Spinner, StateMessage } from '../../components/ui.jsx';
import { formatDuration, formatINR } from '../../utils/format.js';
import { loadActiveEntry, useSelection } from './SelectionContext.jsx';
import './customer.css';

export default function ServicesPage() {
  const navigate = useNavigate();
  const { selectedIds, setSelectedIds, toggle } = useSelection();
  const services = usePolling(() => api.get('/services'), 6000);
  const settings = usePolling(() => api.get('/settings'), 30000);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [notice, setNotice] = useState('');
  const activeEntry = loadActiveEntry();

  const list = services.data?.services || [];
  const categories = services.data?.categories || [];

  // If admin disables/removes a selected service, drop it and tell the customer.
  useEffect(() => {
    if (!services.data) return;
    const ok = new Set(list.filter((s) => s.available).map((s) => s.id));
    const dropped = selectedIds.filter((id) => !ok.has(id));
    if (dropped.length) {
      const names = dropped.map((id) => list.find((s) => s.id === id)?.name || 'A service');
      setSelectedIds((ids) => ids.filter((id) => ok.has(id)));
      setNotice(`${names.join(', ')} is no longer available and was removed from your selection.`);
    }
  }, [services.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((s) => (category === 'All' || s.category === category) && (!q || s.name.toLowerCase().includes(q)));
  }, [list, search, category]);

  const selected = list.filter((s) => selectedIds.includes(s.id));
  const totalPrice = selected.reduce((t, s) => t + s.price, 0);
  const totalMin = selected.reduce((t, s) => t + s.durationMinutes, 0);
  const anyAvailable = list.some((s) => s.available);
  const closedBlocked = settings.data && settings.data.enforceHours && !settings.data.isOpen;

  return (
    <div className="customer">
      <header className="salon-header">
        <div className="container row row--between">
          <div className="brand">
            <span className="brand__mark">✦</span> {settings.data?.salonName || 'Salon'}
          </div>
          {settings.data && (
            <div className="open-pill">
              <span className={`dot ${settings.data.isOpen ? 'dot--on' : 'dot--off'}`} />
              {settings.data.isOpen ? 'Open now' : 'Closed'} · {settings.data.openTime}–{settings.data.closeTime}
            </div>
          )}
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>Your salon visit, without the guesswork.</h1>
          <p className="muted">Pick your services, join the queue and watch your wait live from your phone.</p>
        </section>

        {activeEntry && (
          <Alert type="info">
            You have an active token <strong>{activeEntry.token}</strong>. <Link to={`/queue/${activeEntry.id}`}>Track it →</Link>
          </Alert>
        )}
        {notice && <Alert type="warn" onClose={() => setNotice('')}>{notice}</Alert>}
        {closedBlocked && <Alert type="warn">The salon is closed right now. We open at {settings.data.openTime}.</Alert>}

        <div className="toolbar">
          <input
            className="input"
            type="search"
            placeholder="Search services…"
            aria-label="Search services"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="chips" role="group" aria-label="Filter by category">
            {['All', ...categories].map((c) => (
              <button key={c} className={`chip${category === c ? ' chip--on' : ''}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {services.loading && !services.data && <Spinner label="Loading services…" />}
        {services.error && !services.data && (
          <StateMessage title="We couldn't load services" action={<button className="btn btn--primary" onClick={services.refresh}>Try again</button>}>
            {services.error.message}
          </StateMessage>
        )}
        {services.data && !list.length && <StateMessage title="No services yet">Please check back soon or ask at reception.</StateMessage>}
        {services.data && list.length > 0 && !anyAvailable && (
          <Alert type="warn">No services are available right now, so check-in is paused. Please ask at reception.</Alert>
        )}
        {services.data && list.length > 0 && !visible.length && <StateMessage title="No matching services">Try a different search or category.</StateMessage>}

        <div className="service-grid">
          {visible.map((s) => {
            const on = selectedIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                className={`service-card${on ? ' service-card--on' : ''}`}
                aria-pressed={on}
                disabled={!s.available}
                onClick={() => toggle(s.id)}
              >
                <span className="service-card__cat">{s.category}</span>
                <span className="service-card__name">{s.name}</span>
                <span className="service-card__desc">{s.description}</span>
                <span className="service-card__meta">
                  <strong>{formatINR(s.price)}</strong>
                  <span>{formatDuration(s.durationMinutes)}</span>
                </span>
                {!s.available ? <span className="badge badge--off">Currently unavailable</span> : on ? <span className="badge badge--ok">✓ Selected</span> : null}
              </button>
            );
          })}
        </div>

        {selected.length > 0 && (
          <section className="card selection" aria-label="Your selection">
            <h3>Your selection</h3>
            <ul>
              {selected.map((s) => (
                <li key={s.id}>
                  <span>
                    {s.name} <span className="muted">· {formatDuration(s.durationMinutes)}</span>
                  </span>
                  <span className="row">
                    {formatINR(s.price)}
                    <button className="icon-btn" aria-label={`Remove ${s.name}`} onClick={() => toggle(s.id)}>×</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="salon-footer">
          <p>12 Rose Lane, Sector 21, Gandhinagar · +91 98xxx xxxxx</p>
          <p>Open daily {settings.data ? `${settings.data.openTime}–${settings.data.closeTime}` : ''}</p>
        </footer>
      </main>

      <div className="sticky-bar">
        <div className="container row row--between">
          <div>
            {selected.length ? (
              <>
                <strong>{selected.length} service{selected.length > 1 ? 's' : ''}</strong>
                <div className="muted small">{formatINR(totalPrice)} · {formatDuration(totalMin)}</div>
              </>
            ) : (
              <span className="muted">Select one or more services</span>
            )}
          </div>
          <button className="btn btn--primary btn--lg" disabled={!selected.length || closedBlocked} onClick={() => navigate('/check-in')}>
            Join Queue
          </button>
        </div>
      </div>
    </div>
  );
}
