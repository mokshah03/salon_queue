import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'salonQueue.selectedServices';
const Ctx = createContext(null);

function load() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Keeps the selected service ids across Services <-> Check-in (and page refresh).
export function SelectionProvider({ children }) {
  const [selectedIds, setSelectedIds] = useState(load);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(selectedIds));
    } catch {
      /* storage unavailable: selection just won't survive a refresh */
    }
  }, [selectedIds]);

  const toggle = useCallback(
    (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])),
    []
  );
  const clear = useCallback(() => setSelectedIds([]), []);
  const value = useMemo(() => ({ selectedIds, setSelectedIds, toggle, clear }), [selectedIds, toggle, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSelection = () => useContext(Ctx);

export const ACTIVE_ENTRY_KEY = 'salonQueue.activeEntry';
export const saveActiveEntry = (entry) => {
  try {
    localStorage.setItem(ACTIVE_ENTRY_KEY, JSON.stringify({ id: entry.id, token: entry.token, date: entry.dateKey }));
  } catch { /* ignore */ }
};
export const loadActiveEntry = () => {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_ENTRY_KEY) || 'null');
  } catch {
    return null;
  }
};
export const clearActiveEntry = () => {
  try {
    localStorage.removeItem(ACTIVE_ENTRY_KEY);
  } catch { /* ignore */ }
};
