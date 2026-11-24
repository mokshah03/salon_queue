import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { usePolling } from '../../hooks/usePolling.js';
import './display.css';

const HIGHLIGHT_MS = 5000;

// Public waiting-room screen: independent, no navigation, no personal data.
export default function DisplayPage() {
  const { data, error } = usePolling(() => api.get('/display'), 4000);
  const seen = useRef(null);
  const [fresh, setFresh] = useState({});
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  // Highlight tokens that were newly called since the previous poll (first load never flashes).
  useEffect(() => {
    if (!data) return;
    const keyOf = (e) => `${e.token}@${e.calledAt}`;
    const current = new Set(data.nowServing.map(keyOf));
    if (seen.current) {
      const newly = data.nowServing.filter((e) => !seen.current.has(keyOf(e))).map((e) => e.token);
      if (newly.length) {
        setFresh((f) => ({ ...f, ...Object.fromEntries(newly.map((t) => [t, true])) }));
        setTimeout(
          () => setFresh((f) => {
            const n = { ...f };
            newly.forEach((t) => delete n[t]);
            return n;
          }),
          HIGHLIGHT_MS
        );
      }
    }
    seen.current = current;
  }, [data]);

  const serving = data?.nowServing || [];
  const main = serving[0];
  const others = serving.slice(1, 4);
  const upNext = data?.upNext || [];

  return (
    <div className="tv">
      <header className="tv__head">
        <div className="tv__brand">✦ Lumière Salon</div>
        <div className="tv__clock">
          {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
          {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      <main className="tv__main">
        <section className="tv__serving" aria-live="polite">
          <h2>NOW SERVING</h2>
          {main ? (
            <div className={`tv__hero${fresh[main.token] ? ' tv__flash' : ''}`}>
              <div className="tv__token">{main.token}</div>
              <div className="tv__line">{main.stylist ? `with ${main.stylist}` : 'Please proceed to reception'}</div>
              <div className="tv__sub">{main.service}</div>
              <div className="tv__state">{main.status === 'CALLED' ? 'Please come to the counter' : 'Service in progress'}</div>
            </div>
          ) : (
            <div className="tv__empty">{data ? 'Waiting for the next customer' : 'Loading…'}</div>
          )}
          {others.length > 0 && (
            <div className="tv__others">
              {others.map((o) => (
                <div key={o.token} className={`tv__other${fresh[o.token] ? ' tv__flash' : ''}`}>
                  <b>{o.token}</b>
                  <span>{o.stylist || 'Reception'}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="tv__next">
          <h2>UP NEXT</h2>
          {upNext.length ? (
            <ol>
              {upNext.map((n) => (
                <li key={n.token}>
                  <span className="tv__ntoken">{n.token}</span>
                  <span className="tv__ninfo">
                    {n.service}
                    {n.stylist && <small>with {n.stylist}</small>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="tv__empty">{data ? 'No customers waiting' : 'Loading…'}</div>
          )}
          {data && data.waitingCount > upNext.length && <div className="tv__more">+ {data.waitingCount - upNext.length} more waiting</div>}
        </section>
      </main>

      <footer className="tv__foot">
        Please listen for your token · Lumière Salon
        {error && <span className="tv__offline"> · reconnecting…</span>}
      </footer>
    </div>
  );
}
