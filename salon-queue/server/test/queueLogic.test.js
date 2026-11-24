// Unit tests for the pure business rules. No database needed:  npm run test:unit
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/utils/queueLogic.js';
import { dateKeyFor, isOpenAt, salonTimeHM } from '../src/utils/dateKey.js';
import { normalizePhone, validateCheckIn, validateService, validateStylist } from '../src/utils/validators.js';

const t0 = new Date('2026-11-22T10:00:00Z');
const mk = (n, extra = {}) => ({
  _id: `e${n}`, tokenNumber: n, status: 'WAITING', checkedInAt: new Date(t0.getTime() + n * 60000),
  totalDurationMinutes: 30, services: [{ serviceId: 's1' }], preferredStylist: null, ...extra,
});
const st = (id, status = 'AVAILABLE', serviceIds = []) => ({ _id: id, name: id, status, serviceIds });
const ID = 'a'.repeat(24);
const validCheckIn = { customerName: 'Anita Rao', phone: '9876543210', serviceIds: [ID], clientRequestId: 'req-1' };

describe('token format and daily reset', () => {
  it('pads to 3 digits with the prefix', () => {
    assert.equal(L.formatToken('S', 1), 'S-001');
    assert.equal(L.formatToken('S', 24), 'S-024');
    assert.equal(L.formatToken('VIP', 123), 'VIP-123');
    assert.equal(L.formatToken('S', 1000), 'S-1000');
  });
  it('salon day changes at local midnight (Asia/Kolkata), not UTC midnight', () => {
    assert.equal(dateKeyFor(new Date('2026-11-22T18:29:00Z')), '2026-11-22'); // 23:59 IST
    assert.equal(dateKeyFor(new Date('2026-11-22T18:31:00Z')), '2026-11-23'); // 00:01 IST
    assert.equal(dateKeyFor(new Date('2026-11-22T00:10:00Z')), '2026-11-22'); // 05:40 IST
  });
  it('opening hours', () => {
    const s = { openTime: '09:00', closeTime: '21:00' };
    assert.equal(salonTimeHM(new Date('2026-11-22T04:00:00Z')), '09:30');
    assert.ok(isOpenAt(s, new Date('2026-11-22T04:00:00Z')));
    assert.ok(!isOpenAt(s, new Date('2026-11-22T16:00:00Z'))); // 21:30
    assert.ok(!isOpenAt(s, new Date('2026-11-22T02:00:00Z'))); // 07:30
  });
});

describe('status transitions', () => {
  const all = L.STATUSES;
  const allowed = new Set([
    'WAITING>CALLED', 'WAITING>CANCELLED', 'CALLED>IN_SERVICE', 'CALLED>NO_SHOW', 'IN_SERVICE>COMPLETED', 'NO_SHOW>WAITING',
  ]);
  it('allows exactly the documented transitions', () => {
    for (const a of all) for (const b of all) assert.equal(L.canTransition(a, b), allowed.has(`${a}>${b}`), `${a}>${b}`);
  });
  it('cannot cancel after service starts or reopen completed', () => {
    assert.ok(!L.canTransition('IN_SERVICE', 'CANCELLED'));
    assert.ok(!L.canTransition('CALLED', 'CANCELLED'));
    assert.deepEqual(L.TRANSITIONS.COMPLETED, []);
  });
  it('statesAllowedBefore', () => {
    assert.deepEqual(L.statesAllowedBefore('CANCELLED'), ['WAITING']);
    assert.deepEqual(L.statesAllowedBefore('WAITING'), ['NO_SHOW']);
  });
});

describe('queue position and ordering', () => {
  it('orders by check-in time then token', () => {
    const es = [mk(3), mk(1), mk(2)];
    assert.deepEqual(L.waitingOf(es).map((e) => e._id), ['e1', 'e2', 'e3']);
    assert.equal(L.positionOf(es[0], es), 3);
  });
  it('ignores non-waiting entries for position', () => {
    const es = [mk(1, { status: 'IN_SERVICE' }), mk(2), mk(3)];
    assert.equal(L.positionOf(es[2], es), 2);
    assert.equal(L.positionOf(es[0], es), null);
  });
});

describe('wait estimate', () => {
  it('divides work ahead by available capable stylists, rounded to 5', () => {
    const es = [mk(1), mk(2), mk(3)];
    assert.equal(L.estimateWait(es[2], { entries: es, stylists: [st('a'), st('b')], now: t0 }).minutes, 30);
    assert.equal(L.estimateWait(es[2], { entries: es, stylists: [st('a')], now: t0 }).minutes, 60);
  });
  it('first in line with free stylist = 0', () => {
    const es = [mk(1)];
    assert.equal(L.estimateWait(es[0], { entries: es, stylists: [st('a')], now: t0 }).minutes, 0);
  });
  it('is unavailable when no stylist is available (break/busy)', () => {
    const es = [mk(1)];
    for (const status of ['BREAK', 'BUSY']) {
      const r = L.estimateWait(es[0], { entries: es, stylists: [st('a', status)], now: t0 });
      assert.equal(r.minutes, null);
      assert.equal(r.reason, 'NO_STAFF');
    }
  });
  it('is unavailable when nobody can perform the service', () => {
    const es = [mk(1)];
    assert.equal(L.estimateWait(es[0], { entries: es, stylists: [st('a', 'AVAILABLE', ['other'])], now: t0 }).minutes, null);
  });
  it('counts remaining time of the service in progress', () => {
    const es = [mk(1, { status: 'IN_SERVICE', startedAt: new Date(t0.getTime() - 10 * 60000), assignedStylist: 'a' }), mk(2)];
    assert.equal(L.estimateWait(es[1], { entries: es, stylists: [st('a')], now: t0 }).minutes, 20);
  });
  it('rounds to the nearest 5 minutes', () => {
    const es = [mk(1, { totalDurationMinutes: 47 }), mk(2)];
    assert.equal(L.estimateWait(es[1], { entries: es, stylists: [st('a')], now: t0 }).minutes, 45);
  });
  it('uses multi-service total duration', () => {
    const es = [mk(1, { totalDurationMinutes: 120 }), mk(2)];
    assert.equal(L.estimateWait(es[1], { entries: es, stylists: [st('a')], now: t0 }).minutes, 120);
  });
  it('preferred stylist only counts their own queue and must be available', () => {
    const es = [mk(1, { preferredStylist: 'b' }), mk(2, { preferredStylist: 'a' })];
    assert.equal(L.estimateWait(es[1], { entries: es, stylists: [st('a'), st('b')], now: t0 }).minutes, 0);
    assert.equal(L.estimateWait(es[1], { entries: es, stylists: [st('a', 'BREAK'), st('b')], now: t0 }).minutes, null);
  });
  it('non-waiting entries have no estimate', () => {
    assert.equal(L.estimateWait(mk(1, { status: 'CALLED' }), { entries: [], stylists: [st('a')], now: t0 }).minutes, null);
  });
});

describe('who can be called', () => {
  const pick = (o) => L.pickCallable({ busyIds: new Set(), requestedStylistId: null, ...o });
  it('earliest eligible customer first', () => {
    const p = pick({ waiting: [mk(1), mk(2)], stylists: [st('a')] });
    assert.equal(p.entry._id, 'e1');
  });
  it('skips a customer whose preferred stylist is busy', () => {
    const p = pick({ waiting: [mk(1, { preferredStylist: 'b' }), mk(2)], stylists: [st('a'), st('b')], busyIds: new Set(['b']) });
    assert.equal(p.entry._id, 'e2');
    assert.equal(p.stylist._id, 'a');
  });
  it('an ineligible stylist cannot call another stylist\'s customer', () => {
    const p = pick({ waiting: [mk(1, { preferredStylist: 'b' })], stylists: [st('a'), st('b')], requestedStylistId: 'a' });
    assert.ok(!p.entry);
  });
  it('stylist on break / busy / unknown is rejected', () => {
    assert.match(pick({ waiting: [mk(1)], stylists: [st('a', 'BREAK')], requestedStylistId: 'a' }).reason, /not available/);
    assert.match(pick({ waiting: [mk(1)], stylists: [st('a')], busyIds: new Set(['a']), requestedStylistId: 'a' }).reason, /already with a customer/);
    assert.match(pick({ waiting: [mk(1)], stylists: [st('a')], requestedStylistId: 'zzz' }).reason, /not found/);
  });
  it('respects service skills', () => {
    const p = pick({ waiting: [mk(1)], stylists: [st('a', 'AVAILABLE', ['other']), st('b', 'AVAILABLE', ['s1'])] });
    assert.equal(p.stylist._id, 'b');
  });
  it('nothing waiting / nobody free', () => {
    assert.match(pick({ waiting: [], stylists: [st('a')] }).reason, /No customers/);
    assert.match(pick({ waiting: [mk(1)], stylists: [st('a', 'BREAK')] }).reason, /No available stylist/);
  });
});

describe('validation', () => {
  it('normalises Indian mobile numbers', () => {
    assert.equal(normalizePhone('+91 98765-43210'), '9876543210');
    assert.equal(normalizePhone('09876543210'), '9876543210');
    assert.equal(normalizePhone('919876543210'), '9876543210');
  });
  it('accepts a valid check-in', () => {
    assert.equal(validateCheckIn(validCheckIn).phone, '9876543210');
  });
  it('rejects bad names, phones, services and request ids', () => {
    const bad = [
      { customerName: '' }, { customerName: ' ' }, { customerName: 'A' }, { customerName: '12345' }, { customerName: '<b>x</b>' },
      { phone: '' }, { phone: '12345' }, { phone: '5876543210' }, { phone: '98765432101' }, { phone: 'abcdefghij' },
      { serviceIds: [] }, { serviceIds: undefined }, { serviceIds: ['nope'] }, { serviceIds: [ID, ID, 'x'] },
      { clientRequestId: '' },
    ];
    for (const b of bad) assert.throws(() => validateCheckIn({ ...validCheckIn, ...b }), (e) => e.status === 400 && Boolean(e.extra.errors), JSON.stringify(b));
  });
  it('accepts Indic and accented names', () => {
    for (const n of ['अनिता राव', 'தமிழ் செல்வி', "Renée O'Brien-Smith"]) assert.equal(validateCheckIn({ ...validCheckIn, customerName: n }).customerName, n);
  });
  it('de-duplicates repeated service ids', () => {
    assert.equal(validateCheckIn({ ...validCheckIn, serviceIds: [ID, ID] }).serviceIds.length, 1);
  });
  const svc = { name: 'Facial', category: 'Skin Care', description: 'x', price: 500, durationMinutes: 30, available: true };
  it('service: accepts valid and numeric strings', () => {
    assert.equal(validateService(svc).price, 500);
    assert.equal(validateService({ ...svc, price: '750', durationMinutes: '45' }).durationMinutes, 45);
  });
  it('service: rejects negative/invalid price, duration, category, name', () => {
    for (const b of [{ price: -1 }, { price: '' }, { price: 'abc' }, { price: true }, { price: null }, { price: 1e9 }, { durationMinutes: 0 }, { durationMinutes: -30 },
      { durationMinutes: 2.5 }, { durationMinutes: 'x' }, { durationMinutes: 1000 }, { category: 'Spa' }, { name: '' }, { available: 'yes' }]) {
      assert.throws(() => validateService({ ...svc, ...b }), (e) => e.status === 400, JSON.stringify(b));
    }
  });
  it('stylist: validation', () => {
    assert.equal(validateStylist({ name: 'Asha' }).status, 'AVAILABLE');
    assert.throws(() => validateStylist({ name: '' }));
    assert.throws(() => validateStylist({ name: 'Asha', status: 'ASLEEP' }));
    assert.throws(() => validateStylist({ name: 'Asha', serviceIds: ['bad'] }));
  });
});
