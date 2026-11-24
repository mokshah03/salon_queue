export const formatINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

export function formatDuration(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

export const STATUS_LABEL = {
  WAITING: 'Waiting',
  CALLED: 'Called',
  IN_SERVICE: 'In service',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
};

export const STYLIST_STATUS_LABEL = { AVAILABLE: 'Available', BUSY: 'Busy', BREAK: 'On break' };

export const makeId = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const servicesSummary = (services) =>
  services.length > 1 ? `${services[0].name} +${services.length - 1} more` : services[0]?.name || '';
