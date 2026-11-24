import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { usePolling } from '../../hooks/usePolling.js';
import { Alert, Field, Spinner, StateMessage } from '../../components/ui.jsx';
import { formatDuration, formatINR, makeId, STYLIST_STATUS_LABEL } from '../../utils/format.js';
import { saveActiveEntry, useSelection } from './SelectionContext.jsx';
import './customer.css';

const PHONE_RE = /^[6-9]\d{9}$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u;

function validate({ name, phone }) {
  const errors = {};
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 60) errors.customerName = 'Enter your name (2-60 characters).';
  else if (!NAME_RE.test(n)) errors.customerName = "Name can only contain letters, spaces, . ' and -.";
  const p = phone.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  if (!PHONE_RE.test(p)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  return errors;
}

export default function CheckInPage() {
  const navigate = useNavigate();
  const { selectedIds, clear, setSelectedIds } = useSelection();
  const services = usePolling(() => api.get('/services'), 6000);
  const stylists = usePolling(() => api.get('/stylists'), 10000);
  const [step, setStep] = useState(2);
  const [form, setForm] = useState({ name: '', phone: '', stylistId: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [existing, setExisting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef(makeId()); // same id on retries => never a duplicate entry

  if (!selectedIds.length) return <Navigate to="/" replace />;
  if (!services.data) {
    return (
      <div className="customer">
        {services.error ? (
          <StateMessage title="We couldn't load your services" action={<button className="btn btn--primary" onClick={services.refresh}>Try again</button>}>{services.error.message}</StateMessage>
        ) : (
          <Spinner label="Loading…" />
        )}
      </div>
    );
  }

  const all = services.data.services;
  const selected = all.filter((s) => selectedIds.includes(s.id));
  const unavailable = selected.filter((s) => !s.available);
  const totalPrice = selected.reduce((t, s) => t + s.price, 0);
  const totalMin = selected.reduce((t, s) => t + s.durationMinutes, 0);
  const eligibleStylists = (stylists.data?.stylists || []).filter(
    (st) => !st.serviceIds.length || selected.every((s) => st.serviceIds.includes(s.id))
  );
  const chosenStylist = eligibleStylists.find((s) => s.id === form.stylistId);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k === 'name' ? 'customerName' : k]: undefined }));
  };

  const review = (e) => {
    e.preventDefault();
    const er = validate(form);
    setErrors(er);
    if (!Object.keys(er).length) setStep(3);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setServerError('');
    setExisting(null);
    try {
      const { entry } = await api.post('/customer/queue', {
        customerName: form.name,
        phone: form.phone,
        serviceIds: selected.map((s) => s.id),
        preferredStylistId: form.stylistId || null,
        clientRequestId: requestId.current,
      });
      saveActiveEntry(entry);
      navigate(`/queue/${entry.id}`, { replace: true });
      clear(); // after navigating, so the empty-selection redirect cannot win
    } catch (err) {
      setServerError(err.message);
      if (err.data?.errors) {
        setErrors(err.data.errors);
        setStep(2);
      }
      if (err.data?.code === 'ALREADY_IN_QUEUE') setExisting(err.data);
      if (err.data?.code === 'SERVICE_UNAVAILABLE') {
        setSelectedIds((ids) => ids.filter((id) => !err.data.serviceIds.includes(id)));
        services.refresh();
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="customer">
      <header className="salon-header">
        <div className="container row row--between">
          <Link to="/" className="btn btn--ghost btn--sm">← Back to services</Link>
          <div className="brand"><span className="brand__mark">✦</span> Check-in</div>
        </div>
      </header>

      <main className="container narrow">
        <ol className="steps" aria-label="Progress">
          {['Service', 'Details', 'Confirm'].map((label, i) => {
            const n = i + 1;
            return (
              <li key={label} className={n < step ? 'steps__done' : n === step ? 'steps__now' : ''} aria-current={n === step ? 'step' : undefined}>
                <span>{n < step ? '✓' : n}</span> {label}
              </li>
            );
          })}
        </ol>

        {!selected.length && <Alert type="error">The services you picked are no longer offered. Please go back and choose again.</Alert>}
        {unavailable.length > 0 && (
          <Alert type="error">
            {unavailable.map((s) => s.name).join(', ')} {unavailable.length > 1 ? 'are' : 'is'} no longer available. Please go back and update your selection.
          </Alert>
        )}
        {serverError && <Alert type="error">{serverError}{existing && <> <Link to={`/queue/${existing.entryId}`}>Track {existing.token} →</Link></>}</Alert>}

        <section className="card">
          <h3>Your services</h3>
          <ul className="summary-list">
            {selected.map((s) => (
              <li key={s.id}><span>{s.name}<span className="muted"> · {formatDuration(s.durationMinutes)}</span></span><span>{formatINR(s.price)}</span></li>
            ))}
            <li className="summary-list__total"><span>Total · {formatDuration(totalMin)}</span><span>{formatINR(totalPrice)}</span></li>
          </ul>
        </section>

        {step === 2 && (
          <form className="card" onSubmit={review} noValidate id="details-form">
            <h3>Your details</h3>
            <Field label="Full name" error={errors.customerName}>
              <input value={form.name} onChange={set('name')} autoComplete="name" maxLength={60} placeholder="e.g. Anita Rao" />
            </Field>
            <Field label="Mobile number" error={errors.phone} hint="10-digit Indian mobile number. Used only to find your token.">
              <input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="98765 43210" maxLength={16} />
            </Field>
            <Field label="Preferred stylist (optional)" error={errors.preferredStylistId}>
              <select value={form.stylistId} onChange={set('stylistId')}>
                <option value="">Any available stylist</option>
                {eligibleStylists.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.status !== 'AVAILABLE' ? ` (${STYLIST_STATUS_LABEL[s.status].toLowerCase()})` : ''}</option>
                ))}
              </select>
            </Field>
          </form>
        )}

        {step === 3 && (
          <section className="card">
            <h3>Confirm</h3>
            <dl className="details">
              <dt>Name</dt><dd>{form.name.trim()}</dd>
              <dt>Mobile</dt><dd>{form.phone.trim()}</dd>
              <dt>Stylist</dt><dd>{chosenStylist?.name || 'Any available stylist'}</dd>
            </dl>
            <button className="btn btn--ghost btn--sm" onClick={() => setStep(2)} disabled={submitting}>Edit details</button>
          </section>
        )}
      </main>

      <div className="sticky-bar">
        <div className="container narrow">
          {step === 2 ? (
            <button className="btn btn--primary btn--lg btn--block" type="submit" form="details-form" disabled={unavailable.length > 0}>
              Review & confirm
            </button>
          ) : (
            <button className="btn btn--primary btn--lg btn--block" onClick={submit} disabled={submitting || unavailable.length > 0 || !selected.length}>
              {submitting ? 'Joining…' : 'Join Queue'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
