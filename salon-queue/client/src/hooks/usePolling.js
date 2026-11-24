import { useCallback, useEffect, useRef, useState } from 'react';

// Polls `fetcher` every `interval` ms (no overlapping requests). Keeps the last good data
// if a poll fails, so a brief network hiccup does not blank the screen.
// Change `key` to restart polling immediately (e.g. when filters change).
export function usePolling(fetcher, interval = 4000, key = '') {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    let timer;
    const tick = async () => {
      try {
        const data = await fetcherRef.current();
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (error) {
        if (!cancelled) setState((s) => ({ data: s.data, error, loading: false }));
      }
      if (!cancelled) timer = setTimeout(tick, interval);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [interval, key, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, refresh };
}
