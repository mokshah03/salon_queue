// Pure queue business rules (no database access) so they are easy to test.

export const STATUSES = ['WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
export const ACTIVE_STATUSES = ['WAITING', 'CALLED', 'IN_SERVICE'];

// Allowed status transitions (docs/03-flows-rules.md).
export const TRANSITIONS = {
  WAITING: ['CALLED', 'CANCELLED'],
  CALLED: ['IN_SERVICE', 'NO_SHOW'],
  IN_SERVICE: ['COMPLETED'],
  NO_SHOW: ['WAITING'], // deliberate "return to queue" only
  COMPLETED: [],
  CANCELLED: [],
};

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
export const statesAllowedBefore = (to) => Object.keys(TRANSITIONS).filter((f) => TRANSITIONS[f].includes(to));

export const formatToken = (prefix, n) => `${prefix}-${String(n).padStart(3, '0')}`;
export const roundToFive = (m) => Math.round(m / 5) * 5;
export const minutesBetween = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / 60000);
const sum = (arr) => arr.reduce((t, n) => t + n, 0);
const sid = (v) => (v ? String(v) : '');

// A stylist with no services assigned is treated as able to perform every service.
export function stylistCanPerform(stylist, serviceIds) {
  const ids = (stylist.serviceIds || []).map(String);
  if (!ids.length) return true;
  return serviceIds.every((id) => ids.includes(String(id)));
}
const entryServiceIds = (e) => (e.services || []).map((s) => sid(s.serviceId));

export function sortQueue(list) {
  return [...list].sort(
    (a, b) => new Date(a.checkedInAt) - new Date(b.checkedInAt) || a.tokenNumber - b.tokenNumber
  );
}
export const waitingOf = (entries) => sortQueue(entries.filter((e) => e.status === 'WAITING'));

export function positionOf(entry, entries) {
  const i = waitingOf(entries).findIndex((e) => sid(e._id) === sid(entry._id));
  return i === -1 ? null : i + 1;
}

// Basic estimate from docs: work ahead / available staff who can do the service, rounded to 5 min.
// Returns { minutes: number|null, reason }. null => "Wait time unavailable".
export function estimateWait(entry, { entries, stylists, now = new Date() }) {
  if (entry.status !== 'WAITING') return { minutes: null, reason: 'NOT_WAITING' };

  const waiting = waitingOf(entries);
  const idx = waiting.findIndex((e) => sid(e._id) === sid(entry._id));
  const ahead = idx === -1 ? waiting : waiting.slice(0, idx);
  const inProgress = entries.filter((e) => e.status === 'CALLED' || e.status === 'IN_SERVICE');
  const remaining = (e) =>
    e.status === 'IN_SERVICE'
      ? Math.max(0, e.totalDurationMinutes - minutesBetween(e.startedAt || now, now))
      : e.totalDurationMinutes;

  const prefId = sid(entry.preferredStylist);
  let staff = stylists.filter((s) => s.status === 'AVAILABLE' && stylistCanPerform(s, entryServiceIds(entry)));
  let aheadList = ahead;
  let activeList = inProgress;
  if (prefId) {
    staff = staff.filter((s) => sid(s._id) === prefId);
    aheadList = ahead.filter((e) => sid(e.preferredStylist) === prefId);
    activeList = inProgress.filter((e) => sid(e.assignedStylist) === prefId);
  }
  if (!staff.length) return { minutes: null, reason: 'NO_STAFF' };

  const work = sum(aheadList.map((e) => e.totalDurationMinutes)) + sum(activeList.map(remaining));
  return { minutes: roundToFive(work / staff.length), reason: null, staffCount: staff.length };
}

// Choose which waiting customer (and which stylist) a "call next" should use.
export function pickCallable({ waiting, stylists, busyIds, requestedStylistId }) {
  if (!waiting.length) return { reason: 'No customers are waiting.' };
  let pool = stylists.filter((s) => s.status === 'AVAILABLE' && !busyIds.has(sid(s._id)));

  if (requestedStylistId) {
    const req = stylists.find((s) => sid(s._id) === sid(requestedStylistId));
    if (!req) return { reason: 'Stylist not found.' };
    if (req.status !== 'AVAILABLE') return { reason: `${req.name} is not available (${req.status.toLowerCase()}).` };
    if (busyIds.has(sid(req._id))) return { reason: `${req.name} is already with a customer.` };
    pool = [req];
  }
  if (!pool.length) return { reason: 'No available stylist is free right now.' };

  for (const entry of waiting) {
    const match = pool.find(
      (s) =>
        (!entry.preferredStylist || sid(entry.preferredStylist) === sid(s._id)) &&
        stylistCanPerform(s, entryServiceIds(entry))
    );
    if (match) return { entry, stylist: match };
  }
  return {
    reason: requestedStylistId
      ? 'No waiting customer is eligible for this stylist.'
      : 'No waiting customer can be called right now (their stylist is busy or away).',
  };
}
