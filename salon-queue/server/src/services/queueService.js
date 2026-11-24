import QueueEntry from '../models/QueueEntry.js';
import Stylist from '../models/Stylist.js';
import Service from '../models/Service.js';
import DailyCounter from '../models/DailyCounter.js';
import Settings from '../models/Settings.js';
import { AppError } from '../utils/errors.js';
import { isObjectId, validateCheckIn } from '../utils/validators.js';
import { dateKeyFor, isOpenAt } from '../utils/dateKey.js';
import {
  ACTIVE_STATUSES,
  estimateWait,
  formatToken,
  minutesBetween,
  pickCallable,
  positionOf,
  statesAllowedBefore,
  stylistCanPerform,
  waitingOf,
} from '../utils/queueLogic.js';

const label = (s) => s.replace('_', ' ').toLowerCase();

// ---------------------------------------------------------------- settings / context
export async function getSettings() {
  let s = await Settings.findById('main').lean();
  if (!s) {
    try {
      s = (await Settings.create({ _id: 'main' })).toObject();
    } catch (err) {
      if (err.code !== 11000) throw err;
      s = await Settings.findById('main').lean();
    }
  }
  return s;
}

const nameMap = (stylists) => new Map(stylists.map((s) => [String(s._id), s.name]));

async function loadContext(dateKey) {
  const [entries, stylists] = await Promise.all([
    QueueEntry.find({ dateKey, status: { $in: ACTIVE_STATUSES } })
      .sort({ checkedInAt: 1, tokenNumber: 1 })
      .lean(),
    Stylist.find().lean(),
  ]);
  return { entries, stylists, now: new Date(), names: nameMap(stylists) };
}

export async function loadDay() {
  const now = new Date();
  const dateKey = dateKeyFor(now);
  const [all, stylists, settings] = await Promise.all([
    QueueEntry.find({ dateKey }).sort({ checkedInAt: 1, tokenNumber: 1 }).lean(),
    Stylist.find().sort({ name: 1 }).lean(),
    getSettings(),
  ]);
  const entries = all.filter((e) => ACTIVE_STATUSES.includes(e.status));
  return { all, entries, stylists, settings, dateKey, now, names: nameMap(stylists) };
}

// ---------------------------------------------------------------- views
export function buildView(entry, ctx, { includePhone = false } = {}) {
  const ref = (id) => (id ? { id: String(id), name: ctx.names.get(String(id)) || 'Former stylist' } : null);
  const waiting = entry.status === 'WAITING';
  const est = waiting ? estimateWait(entry, ctx) : null;
  const pos = waiting ? positionOf(entry, ctx.entries) : null;
  const end = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(entry.status) ? null : ctx.now;

  return {
    id: String(entry._id),
    token: entry.token,
    dateKey: entry.dateKey,
    customerName: entry.customerName,
    ...(includePhone ? { phone: entry.phone } : {}),
    services: entry.services.map(({ name, category, price, durationMinutes }) => ({ name, category, price, durationMinutes })),
    totalPrice: entry.totalPrice,
    totalDurationMinutes: entry.totalDurationMinutes,
    status: entry.status,
    preferredStylist: ref(entry.preferredStylist),
    assignedStylist: ref(entry.assignedStylist),
    position: pos,
    ahead: pos ? pos - 1 : null,
    wait: est ? { minutes: est.minutes, available: est.minutes !== null, reason: est.reason } : null,
    estimatedWaitAtCheckIn: entry.estimatedWaitAtCheckIn ?? null,
    waitedMinutes: end ? Math.floor(minutesBetween(entry.checkedInAt, end)) : null,
    elapsedMinutes: entry.status === 'IN_SERVICE' ? Math.floor(minutesBetween(entry.startedAt, ctx.now)) : null,
    checkedInAt: entry.checkedInAt,
    calledAt: entry.calledAt || null,
    startedAt: entry.startedAt || null,
    completedAt: entry.completedAt || null,
    canCancel: waiting,
  };
}

export async function getEntryView(rawId, opts) {
  const id = String(rawId);
  if (!isObjectId(id)) throw new AppError(404, 'Queue entry not found.');
  const entry = await QueueEntry.findById(id).lean();
  if (!entry) throw new AppError(404, 'Queue entry not found.');
  const ctx = await loadContext(entry.dateKey);
  return buildView(entry, ctx, opts);
}

// ---------------------------------------------------------------- tokens + check-in
async function nextTokenNumber(dateKey) {
  for (let i = 0; i < 3; i++) {
    try {
      const c = await DailyCounter.findOneAndUpdate({ _id: dateKey }, { $inc: { seq: 1 } }, { upsert: true, new: true });
      return c.seq;
    } catch (err) {
      if (err.code !== 11000 || i === 2) throw err;
    }
  }
}

export async function checkIn(raw) {
  const input = validateCheckIn(raw);
  const settings = await getSettings();
  const now = new Date();
  const dateKey = dateKeyFor(now);

  if (settings.enforceHours && !isOpenAt(settings, now)) {
    throw new AppError(403, `The salon is closed right now. We open at ${settings.openTime}.`, { code: 'CLOSED' });
  }

  // Same request submitted twice (double click / retry) => return the original entry.
  const repeat = await QueueEntry.findOne({ clientRequestId: input.clientRequestId }).lean();
  if (repeat) return { entry: await getEntryView(repeat._id), duplicate: true };

  const found = await Service.find({ _id: { $in: input.serviceIds } }).lean();
  if (found.length !== input.serviceIds.length) {
    throw new AppError(400, 'One or more selected services no longer exist.', { code: 'SERVICE_MISSING' });
  }
  const unavailable = found.filter((s) => !s.available);
  if (unavailable.length) {
    throw new AppError(409, `Currently unavailable: ${unavailable.map((s) => s.name).join(', ')}.`, {
      code: 'SERVICE_UNAVAILABLE',
      serviceIds: unavailable.map((s) => String(s._id)),
    });
  }

  if (input.preferredStylistId) {
    const stylist = await Stylist.findById(input.preferredStylistId).lean();
    if (!stylist) throw new AppError(400, 'Selected stylist was not found.', { errors: { preferredStylistId: 'Stylist not found.' } });
    if (!stylistCanPerform(stylist, input.serviceIds)) {
      throw new AppError(400, `${stylist.name} does not perform all selected services.`, {
        errors: { preferredStylistId: `${stylist.name} does not perform all selected services.` },
      });
    }
  }

  const activeKey = `${dateKey}:${input.phone}`;
  const active = await QueueEntry.findOne({ activeKey }).lean();
  if (active) throw alreadyInQueue(active);

  const snapshot = input.serviceIds.map((id) => {
    const s = found.find((f) => String(f._id) === id);
    return { serviceId: s._id, name: s.name, category: s.category, price: s.price, durationMinutes: s.durationMinutes };
  });

  const tokenNumber = await nextTokenNumber(dateKey);
  let created;
  try {
    created = await QueueEntry.create({
      token: formatToken(settings.tokenPrefix, tokenNumber),
      tokenNumber,
      dateKey,
      customerName: input.customerName,
      phone: input.phone,
      services: snapshot,
      totalPrice: snapshot.reduce((t, s) => t + s.price, 0),
      totalDurationMinutes: snapshot.reduce((t, s) => t + s.durationMinutes, 0),
      preferredStylist: input.preferredStylistId,
      status: 'WAITING',
      activeKey,
      clientRequestId: input.clientRequestId,
      checkedInAt: now,
      history: [{ status: 'WAITING', at: now, note: 'Checked in' }],
    });
  } catch (err) {
    if (err.code === 11000) {
      const again = await QueueEntry.findOne({ $or: [{ clientRequestId: input.clientRequestId }, { activeKey }] }).lean();
      if (again?.clientRequestId === input.clientRequestId) return { entry: await getEntryView(again._id), duplicate: true };
      if (again) throw alreadyInQueue(again);
    }
    throw err;
  }

  // Store the estimate shown at check-in (used to highlight customers who wait longer).
  const ctx = await loadContext(dateKey);
  const est = estimateWait(created.toObject(), ctx);
  if (est.minutes !== null) {
    await QueueEntry.updateOne({ _id: created._id }, { $set: { estimatedWaitAtCheckIn: est.minutes } }).catch(() => {});
  }
  return { entry: await getEntryView(created._id), duplicate: false };
}

const alreadyInQueue = (entry) =>
  new AppError(409, `This mobile number already has an active token today (${entry.token}).`, {
    code: 'ALREADY_IN_QUEUE',
    entryId: String(entry._id),
    token: entry.token,
  });

// ---------------------------------------------------------------- transitions
const STAMPS = { IN_SERVICE: 'startedAt', COMPLETED: 'completedAt', CANCELLED: 'cancelledAt', NO_SHOW: 'noShowAt' };
const TERMINAL = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

// Atomic: the update only matches if the entry is still in a status allowed before `to`,
// so two staff members acting on the same customer cannot both succeed.
export async function transitionEntry(id, to, { note = '' } = {}) {
  if (!isObjectId(id)) throw new AppError(404, 'Queue entry not found.');
  const now = new Date();
  const set = { status: to };
  const unset = {};
  if (STAMPS[to]) set[STAMPS[to]] = now;
  if (TERMINAL.includes(to)) unset.activeKey = 1;
  if (to === 'WAITING') {
    const cur = await QueueEntry.findById(id).lean();
    if (!cur) throw new AppError(404, 'Queue entry not found.');
    set.activeKey = `${cur.dateKey}:${cur.phone}`;
    Object.assign(unset, { calledAt: 1, assignedStylist: 1, noShowAt: 1 });
  }
  const update = { $set: set, $push: { history: { status: to, at: now, note } } };
  if (Object.keys(unset).length) update.$unset = unset;

  let updated;
  try {
    updated = await QueueEntry.findOneAndUpdate({ _id: id, status: { $in: statesAllowedBefore(to) } }, update, { new: true }).lean();
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'This customer already has another active token today.');
    throw err;
  }
  if (!updated) {
    const cur = await QueueEntry.findById(id).lean();
    if (!cur) throw new AppError(404, 'Queue entry not found.');
    throw new AppError(
      409,
      to === 'CANCELLED' ? 'Only waiting entries can be cancelled.' : `Cannot change status from ${label(cur.status)} to ${label(to)}.`,
      { code: 'INVALID_TRANSITION', status: cur.status }
    );
  }
  return updated;
}

export async function callNext({ stylistId = null } = {}) {
  const dateKey = dateKeyFor();
  for (let attempt = 0; attempt < 5; attempt++) {
    const ctx = await loadContext(dateKey);
    const busyIds = new Set(ctx.entries.filter((e) => e.status !== 'WAITING' && e.assignedStylist).map((e) => String(e.assignedStylist)));
    const pick = pickCallable({ waiting: waitingOf(ctx.entries), stylists: ctx.stylists, busyIds, requestedStylistId: stylistId });
    if (!pick.entry) throw new AppError(409, pick.reason, { code: 'NOTHING_TO_CALL' });

    const now = new Date();
    const claimed = await QueueEntry.findOneAndUpdate(
      { _id: pick.entry._id, status: 'WAITING' },
      {
        $set: { status: 'CALLED', calledAt: now, assignedStylist: pick.stylist._id },
        $push: { history: { status: 'CALLED', at: now, note: `Called for ${pick.stylist.name}` } },
      },
      { new: true }
    ).lean();
    if (!claimed) continue; // someone else got this customer first; pick again

    // Two simultaneous calls for the same stylist: undo ours and retry.
    const clash = await QueueEntry.countDocuments({
      dateKey,
      assignedStylist: pick.stylist._id,
      status: { $in: ['CALLED', 'IN_SERVICE'] },
      _id: { $ne: claimed._id },
    });
    if (clash) {
      await QueueEntry.updateOne(
        { _id: claimed._id, status: 'CALLED' },
        { $set: { status: 'WAITING' }, $unset: { calledAt: 1, assignedStylist: 1 }, $push: { history: { status: 'WAITING', at: new Date(), note: 'Call reverted (stylist busy)' } } }
      );
      continue;
    }
    return claimed;
  }
  throw new AppError(409, 'The queue changed while calling. Please try again.');
}

// ---------------------------------------------------------------- stylist helpers
export function stylistsWithActivity(day) {
  const current = new Map();
  for (const e of day.entries) {
    if (e.status !== 'WAITING' && e.assignedStylist) current.set(String(e.assignedStylist), { token: e.token, status: e.status });
  }
  return day.stylists.map((s) => ({
    id: String(s._id),
    name: s.name,
    specialties: s.specialties,
    serviceIds: (s.serviceIds || []).map(String),
    status: s.status,
    current: current.get(String(s._id)) || null,
  }));
}

// ---------------------------------------------------------------- staff board
export async function getStaffBoard({ service, stylist, search } = {}) {
  const day = await loadDay();
  const { all, entries, settings } = day;
  const counts = { waiting: 0, called: 0, inService: 0, completed: 0, noShow: 0, cancelled: 0, total: all.length };
  const key = { WAITING: 'waiting', CALLED: 'called', IN_SERVICE: 'inService', COMPLETED: 'completed', NO_SHOW: 'noShow', CANCELLED: 'cancelled' };
  all.forEach((e) => (counts[key[e.status]] += 1));

  const q = String(search || '').trim().toLowerCase();
  const matches = (e) =>
    (!service || e.services.some((s) => String(s.serviceId) === service)) &&
    (!stylist || String(e.preferredStylist) === stylist || String(e.assignedStylist) === stylist) &&
    (!q || e.token.toLowerCase().includes(q) || e.customerName.toLowerCase().includes(q));

  const view = (e) => {
    const v = buildView(e, day, { includePhone: true });
    const limit = v.estimatedWaitAtCheckIn ?? settings.warnAfterMinutes;
    v.overdue = e.status === 'WAITING' && v.waitedMinutes > limit;
    return v;
  };
  const byTime = (field) => (a, b) => new Date(a[field]) - new Date(b[field]);
  return {
    date: day.dateKey,
    counts,
    warnAfterMinutes: settings.warnAfterMinutes,
    sections: {
      waiting: waitingOf(entries).filter(matches).map(view),
      called: entries.filter((e) => e.status === 'CALLED').sort(byTime('calledAt')).filter(matches).map(view),
      inService: entries.filter((e) => e.status === 'IN_SERVICE').sort(byTime('startedAt')).filter(matches).map(view),
      noShow: all.filter((e) => e.status === 'NO_SHOW').filter(matches).map(view),
    },
    stylists: stylistsWithActivity(day),
  };
}

// ---------------------------------------------------------------- public display (no personal data)
export async function getDisplay() {
  const day = await loadDay();
  const svcLabel = (e) => (e.services.length > 1 ? `${e.services[0].name} +${e.services.length - 1} more` : e.services[0]?.name || '');
  const stylistName = (id) => (id ? day.names.get(String(id)) || null : null);
  return {
    serverTime: day.now,
    nowServing: day.entries
      .filter((e) => e.status !== 'WAITING')
      .sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt))
      .map((e) => ({ token: e.token, status: e.status, stylist: stylistName(e.assignedStylist), service: svcLabel(e), calledAt: e.calledAt })),
    upNext: waitingOf(day.entries)
      .slice(0, 5)
      .map((e) => ({ token: e.token, service: svcLabel(e), stylist: stylistName(e.preferredStylist) })),
    waitingCount: day.entries.filter((e) => e.status === 'WAITING').length,
  };
}

// ---------------------------------------------------------------- admin summary
export function buildSummary(all) {
  const count = (s) => all.filter((e) => e.status === s).length;
  const waits = all.filter((e) => e.calledAt).map((e) => minutesBetween(e.checkedInAt, e.calledAt));
  const tally = new Map();
  all
    .filter((e) => e.status !== 'CANCELLED')
    .forEach((e) => e.services.forEach((s) => tally.set(s.name, (tally.get(s.name) || 0) + 1)));
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    checkedIn: all.length,
    waiting: count('WAITING'),
    called: count('CALLED'),
    serving: count('IN_SERVICE'),
    completed: count('COMPLETED'),
    noShow: count('NO_SHOW'),
    cancelled: count('CANCELLED'),
    averageWaitMinutes: waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : null,
    mostPopularService: top ? { name: top[0], count: top[1] } : null,
  };
}
