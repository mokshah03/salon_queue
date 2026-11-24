import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../services/api.js';
import { usePolling } from '../../hooks/usePolling.js';
import { Alert, ConfirmDialog, Spinner, StateMessage, StatusBadge } from '../../components/ui.jsx';
import { formatDuration, formatINR, formatTime } from '../../utils/format.js';
import { clearActiveEntry } from './SelectionContext.jsx';
import './customer.css';

const STEPS = [
  ['WAITING', 'Waiting'],
  ['CALLED', 'Called'],
  ['IN_SERVICE', 'In service'],
  ['COMPLETED', 'Completed'],
];

function waitText(wait) {
  if (!wait || !wait.available) return 'Wait time unavailable';
  return wait.minutes === 0 ? 'Any moment now' : `About ${wait.minutes} min`;
}

export default function QueueStatusPage() {
  const { id } = useParams();
  const { data, error, loading, refresh } = usePolling(() => api.get(`/customer/queue/${id}`), 4000, id);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const entry = data?.entry;

  useEffect(() => {
    if (entry && ['COMPLETED', 'CANCELLED'].includes(entry.status)) clearActiveEntry();
  }, [entry?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    setBusy(true);
    setActionError('');
    try {
      await api.post(`/customer/queue/${id}/cancel`);
      setConfirming(false);
      refresh();
    } catch (err) {
      setActionError(err.message);
      setConfirming(false);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!entry) {
    if (loading) return <div className="customer"><Spinner label="Finding your token…" /></div>;
    return (
      <div className="customer">
        <StateMessage
          title={error?.status === 404 ? "We couldn't find that token" : "We couldn't load your token"}
          action={<div className="row" style={{ justifyContent: 'center' }}><button className="btn btn--primary" onClick={refresh}>Try again</button><Link className="btn btn--ghost" to="/">Back to services</Link></div>}
        >
          {error?.status === 404 ? 'Check the link you were given, or ask at reception for help.' : error?.message}
        </StateMessage>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex(([s]) => s === entry.status);
  const stylist = entry.assignedStylist || entry.preferredStylist;
  const ended = ['CANCELLED', 'NO_SHOW'].includes(entry.status);

  return (
    <div className="customer">
      <header className="salon-header">
        <div className="container row row--between">
          <div className="brand"><span className="brand__mark">✦</span> Your queue status</div>
          <StatusBadge status={entry.status} />
        </div>
      </header>

      <main className="container narrow">
        {error && <Alert type="warn">Connection lost — retrying automatically…</Alert>}
        {actionError && <Alert type="error" onClose={() => setActionError('')}>{actionError}</Alert>}

        {entry.status === 'CALLED' && (
          <div className="called-banner" role="status">Please head to reception.<small>{entry.assignedStylist ? `${entry.assignedStylist.name} is ready for you.` : "It's your turn!"}</small></div>
        )}
        {entry.status === 'NO_SHOW' && <Alert type="error">You were marked as no-show. Please speak to reception if you are still here.</Alert>}
        {entry.status === 'CANCELLED' && <Alert type="info">This token was cancelled. Numbers are never reused, so you'll get a new one if you rejoin.</Alert>}
        {entry.status === 'COMPLETED' && <Alert type="success">All done — thank you for visiting!</Alert>}

        <section className="card token-card">
          <div className="muted small">{entry.dateKey}</div>
          <div className="token">{entry.token}</div>
          <div className="token-card__name">{entry.customerName}</div>
        </section>

        {!ended && (
          <ol className="progress" aria-label="Progress">
            {STEPS.map(([s, label], i) => (
              <li key={s} className={i < stepIndex ? 'progress__done' : i === stepIndex ? 'progress__now' : ''}>
                <span className="progress__dot">{i < stepIndex ? '✓' : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}

        {entry.status === 'WAITING' && (
          <section className="card stats">
            <div>
              <div className="muted small">Your position</div>
              <div className="stat">{entry.position}</div>
              <div className="muted small">{entry.ahead === 0 ? 'You are next' : `${entry.ahead} ahead of you`}</div>
            </div>
            <div>
              <div className="muted small">Estimated wait</div>
              <div className="stat stat--sm">{waitText(entry.wait)}</div>
              <div className="muted small">Estimate only, based on the current queue. Not guaranteed.</div>
            </div>
          </section>
        )}

        <section className="card">
          <h3>Your visit</h3>
          <ul className="summary-list">
            {entry.services.map((s, i) => (
              <li key={i}><span>{s.name}<span className="muted"> · {formatDuration(s.durationMinutes)}</span></span><span>{formatINR(s.price)}</span></li>
            ))}
            <li className="summary-list__total"><span>Total · {formatDuration(entry.totalDurationMinutes)}</span><span>{formatINR(entry.totalPrice)}</span></li>
          </ul>
          <dl className="details">
            <dt>Stylist</dt>
            <dd>{stylist ? stylist.name : 'Any available stylist'}{!entry.assignedStylist && entry.preferredStylist ? ' (preferred)' : ''}</dd>
            <dt>Checked in</dt><dd>{formatTime(entry.checkedInAt)}</dd>
          </dl>
        </section>

        {entry.canCancel && (
          <button className="btn btn--ghost btn--block" onClick={() => setConfirming(true)}>Cancel my token</button>
        )}
        <p className="muted small center">This page updates automatically. Keep it open or bookmark it.</p>
      </main>

      {confirming && (
        <ConfirmDialog
          title="Cancel your token?"
          message={`${entry.token} will be removed from the queue. You can rejoin later, but you'll get a new token.`}
          confirmLabel="Yes, cancel"
          danger
          busy={busy}
          onConfirm={cancel}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
