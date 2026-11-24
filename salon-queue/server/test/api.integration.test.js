// End-to-end API tests against a REAL MongoDB test database:  npm run test:integration
// Uses MONGODB_URI_TEST (default mongodb://127.0.0.1:27017/salon_queue_test). The database name must
// contain "test" because the suite drops it. Tests are skipped (with a warning) if MongoDB is unreachable.
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import app from '../src/app.js';
import Service from '../src/models/Service.js';
import Stylist from '../src/models/Stylist.js';
import QueueEntry from '../src/models/QueueEntry.js';
import DailyCounter from '../src/models/DailyCounter.js';
import Settings from '../src/models/Settings.js';

const URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/salon_queue_test';
if (!/test/i.test(new URL(URI).pathname)) throw new Error('Refusing to run: test database name must contain "test".');

let server, base, up = false, fx, phoneSeq = 0;

before(async () => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 });
    up = true;
  } catch (e) {
    console.warn(`\n!! MongoDB not reachable at ${URI}: integration tests SKIPPED (${e.message})\n`);
    return;
  }
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) server.close();
  if (up) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  if (!up) return;
  await Promise.all([Service.deleteMany({}), Stylist.deleteMany({}), QueueEntry.deleteMany({}), DailyCounter.deleteMany({}), Settings.deleteMany({})]);
  const [cut, colour, facial] = await Service.create([
    { name: 'Haircut', category: 'Hair Services', price: 500, durationMinutes: 30, available: true },
    { name: 'Colour', category: 'Hair Services', price: 3000, durationMinutes: 90, available: true },
    { name: 'Facial', category: 'Skin Care', price: 1200, durationMinutes: 45, available: false },
  ]);
  const [asha, ben, cara] = await Stylist.create([
    { name: 'Asha', serviceIds: [cut._id, colour._id] },
    { name: 'Ben', serviceIds: [cut._id] },
    { name: 'Cara', serviceIds: [] },
  ]);
  fx = { cut: String(cut._id), colour: String(colour._id), facial: String(facial._id), asha: String(asha._id), ben: String(ben._id), cara: String(cara._id) };
});

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const phone = () => `98${String(10000000 + ++phoneSeq)}`;
const checkIn = (o = {}) => call('POST', '/customer/queue', { customerName: 'Test Customer', phone: phone(), serviceIds: [fx.cut], clientRequestId: `r-${Math.random()}`, ...o });
const staff = (id, action) => call('POST', `/staff/queue/${id}/${action}`);
const callNext = (stylistId) => call('POST', '/staff/call-next', { stylistId: stylistId || null });
const mustCheckIn = async (o) => { const r = await checkIn(o); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.entry; };
const t = (name, fn) => it(name, async (ctx) => { if (!up) return ctx.skip('MongoDB not reachable'); await fn(); });

describe('health', () => {
  t('reports ok while connected', async () => {
    const r = await call('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.database, 'connected');
  });
});

describe('check-in and tokens', () => {
  t('issues sequential tokens S-001, S-002, ...', async () => {
    const a = await mustCheckIn(), b = await mustCheckIn(), c = await mustCheckIn();
    assert.deepEqual([a.token, b.token, c.token], ['S-001', 'S-002', 'S-003']);
  });
  t('10 simultaneous check-ins give 10 unique, contiguous tokens', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => checkIn()));
    assert.ok(results.every((r) => r.status === 201), JSON.stringify(results.map((r) => r.status)));
    const nums = results.map((r) => Number(r.body.entry.token.split('-')[1])).sort((x, y) => x - y);
    assert.deepEqual(nums, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(await QueueEntry.countDocuments(), 10);
  });
  t("another day's counter does not affect today's numbering", async () => {
    await DailyCounter.create({ _id: '2000-01-01', seq: 57 });
    assert.equal((await mustCheckIn()).token, 'S-001');
  });
  t('invalid requests return 400 and do not consume tokens', async () => {
    for (const bad of [{ customerName: '' }, { phone: '123' }, { serviceIds: [] }, { serviceIds: ['zzz'] }, { clientRequestId: '' }]) {
      const r = await checkIn(bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.ok(r.body.errors);
    }
    assert.equal(await QueueEntry.countDocuments(), 0);
    assert.equal((await mustCheckIn()).token, 'S-001');
  });
  t('malformed JSON is a 400', async () => {
    const res = await fetch(`${base}/customer/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    assert.equal(res.status, 400);
  });
  t('same request id twice returns the same entry, one token', async () => {
    const body = { customerName: 'Dup Click', phone: phone(), serviceIds: [fx.cut], clientRequestId: 'same-id' };
    const [x, y] = [await call('POST', '/customer/queue', body), await call('POST', '/customer/queue', body)];
    assert.equal(x.status, 201);
    assert.equal(y.status, 200);
    assert.equal(x.body.entry.id, y.body.entry.id);
    assert.equal(await QueueEntry.countDocuments(), 1);
    assert.equal((await mustCheckIn()).token, 'S-002');
  });
  t('rapid parallel double-submit of one request creates one entry', async () => {
    const body = { customerName: 'Fast Clicker', phone: phone(), serviceIds: [fx.cut], clientRequestId: 'burst' };
    const rs = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/customer/queue', body)));
    assert.ok(rs.every((r) => [200, 201, 409].includes(r.status)));
    assert.equal(await QueueEntry.countDocuments(), 1);
  });
  t('same mobile number cannot hold two active tokens', async () => {
    const p = phone();
    await mustCheckIn({ phone: p });
    const r = await checkIn({ phone: p });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'ALREADY_IN_QUEUE');
  });
  t('mobile number can rejoin after cancelling', async () => {
    const p = phone();
    const first = await mustCheckIn({ phone: p });
    assert.equal((await call('POST', `/customer/queue/${first.id}/cancel`)).status, 200);
    const second = await mustCheckIn({ phone: p });
    assert.equal(second.token, 'S-002'); // cancelled token never reused
  });
  t('unavailable or unknown services are rejected', async () => {
    assert.equal((await checkIn({ serviceIds: [fx.facial] })).status, 409);
    assert.equal((await checkIn({ serviceIds: ['f'.repeat(24)] })).status, 400);
    assert.equal(await QueueEntry.countDocuments(), 0);
  });
  t('preferred stylist must perform the selected services', async () => {
    assert.equal((await checkIn({ preferredStylistId: fx.ben, serviceIds: [fx.colour] })).status, 400);
    assert.equal((await checkIn({ preferredStylistId: fx.asha, serviceIds: [fx.colour] })).status, 201);
  });
  t('multiple services total price and duration, with snapshot', async () => {
    const e = await mustCheckIn({ serviceIds: [fx.cut, fx.colour] });
    assert.equal(e.totalPrice, 3500);
    assert.equal(e.totalDurationMinutes, 120);
    await Service.updateOne({ _id: fx.cut }, { price: 999 });
    const again = await call('GET', `/customer/queue/${e.id}`);
    assert.equal(again.body.entry.totalPrice, 3500);
  });
});

describe('tracking, position and estimates', () => {
  t('position and estimate follow the queue', async () => {
    await Stylist.updateMany({}, { status: 'BREAK' });
    await Stylist.updateOne({ _id: fx.cara }, { status: 'AVAILABLE' });
    const a = await mustCheckIn(), b = await mustCheckIn(), c = await mustCheckIn();
    const tr = async (e) => (await call('GET', `/customer/queue/${e.id}`)).body.entry;
    assert.equal((await tr(a)).position, 1);
    assert.equal((await tr(c)).position, 3);
    assert.equal((await tr(a)).wait.minutes, 0);
    assert.equal((await tr(b)).wait.minutes, 30); // one 30-min customer ahead, one stylist
    assert.equal((await tr(c)).wait.minutes, 60);
  });
  t('estimate is "unavailable" when no stylist is available', async () => {
    await Stylist.updateMany({}, { status: 'BREAK' });
    const e = await mustCheckIn();
    const r = (await call('GET', `/customer/queue/${e.id}`)).body.entry;
    assert.equal(r.wait.available, false);
  });
  t('invalid and unknown ids are 404', async () => {
    assert.equal((await call('GET', '/customer/queue/not-an-id')).status, 404);
    assert.equal((await call('GET', `/customer/queue/${'a'.repeat(24)}`)).status, 404);
  });
});

describe('status transitions and staff actions', () => {
  t('full happy path WAITING > CALLED > IN_SERVICE > COMPLETED', async () => {
    const e = await mustCheckIn();
    const called = await callNext();
    assert.equal(called.status, 200);
    assert.equal(called.body.entry.id, e.id);
    assert.equal(called.body.entry.status, 'CALLED');
    assert.ok(called.body.entry.assignedStylist);
    assert.equal((await staff(e.id, 'start')).body.entry.status, 'IN_SERVICE');
    assert.equal((await staff(e.id, 'complete')).body.entry.status, 'COMPLETED');
    const final = await QueueEntry.findById(e.id).lean();
    assert.ok(final.calledAt && final.startedAt && final.completedAt);
    assert.equal(final.activeKey, undefined);
  });
  t('invalid transitions are rejected with 409', async () => {
    const e = await mustCheckIn();
    for (const a of ['start', 'complete', 'no-show', 'return']) assert.equal((await staff(e.id, a)).status, 409, a);
    await callNext();
    assert.equal((await staff(e.id, 'complete')).status, 409);
    assert.equal((await staff(e.id, 'cancel')).status, 409);
    await staff(e.id, 'start');
    assert.equal((await staff(e.id, 'no-show')).status, 409);
    assert.equal((await staff(e.id, 'cancel')).status, 409);
    await staff(e.id, 'complete');
    for (const a of ['start', 'complete', 'no-show', 'return', 'cancel']) assert.equal((await staff(e.id, a)).status, 409, `completed > ${a}`);
    assert.equal((await call('POST', `/staff/queue/${e.id}/explode`)).status, 404);
  });
  t('customer cancel: only while waiting', async () => {
    const w = await mustCheckIn();
    assert.equal((await call('POST', `/customer/queue/${w.id}/cancel`)).status, 200);
    assert.equal((await call('POST', `/customer/queue/${w.id}/cancel`)).status, 409);
    const c = await mustCheckIn();
    await callNext();
    assert.equal((await call('POST', `/customer/queue/${c.id}/cancel`)).status, 409);
  });
  t('no-show can be returned to the queue at its original position', async () => {
    const a = await mustCheckIn(), b = await mustCheckIn();
    await callNext();
    assert.equal((await staff(a.id, 'no-show')).body.entry.status, 'NO_SHOW');
    assert.equal((await staff(a.id, 'return')).body.entry.status, 'WAITING');
    const r = (await call('GET', `/customer/queue/${a.id}`)).body.entry;
    assert.equal(r.position, 1);
    assert.equal((await call('GET', `/customer/queue/${b.id}`)).body.entry.position, 2);
  });
  t('two simultaneous Call Next for one waiting customer: exactly one wins', async () => {
    await mustCheckIn();
    const rs = await Promise.all([callNext(), callNext(), callNext()]);
    assert.equal(rs.filter((r) => r.status === 200).length, 1, JSON.stringify(rs.map((r) => r.status)));
    assert.ok(rs.every((r) => [200, 409].includes(r.status)));
    assert.equal(await QueueEntry.countDocuments({ status: 'CALLED' }), 1);
  });
  t('simultaneous Call Next with several customers never double-books a stylist', async () => {
    await Stylist.updateMany({ _id: { $ne: fx.cara } }, { status: 'BREAK' });
    for (let i = 0; i < 4; i++) await mustCheckIn();
    await Promise.all([callNext(), callNext(), callNext(), callNext()]);
    assert.equal(await QueueEntry.countDocuments({ status: { $in: ['CALLED', 'IN_SERVICE'] } }), 1);
  });
  t('simultaneous Start on one called customer: one wins', async () => {
    const e = await mustCheckIn();
    await callNext();
    const rs = await Promise.all([staff(e.id, 'start'), staff(e.id, 'start')]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
  });
  t('stylist on break or busy is never assigned', async () => {
    await mustCheckIn();
    await Stylist.updateMany({}, { status: 'BREAK' });
    assert.equal((await callNext()).status, 409);
    assert.equal((await callNext(fx.asha)).status, 409);
    await Stylist.updateOne({ _id: fx.asha }, { status: 'BUSY' });
    assert.equal((await callNext(fx.asha)).status, 409);
  });
  t('preferred stylist routing', async () => {
    const e = await mustCheckIn({ preferredStylistId: fx.ben });
    assert.equal((await callNext(fx.asha)).status, 409);
    assert.equal((await callNext()).body.entry.assignedStylist.id, fx.ben); // auto-pick must choose Ben
    assert.equal((await QueueEntry.findById(e.id).lean()).status, 'CALLED');
  });
  t('a stylist serves one customer at a time', async () => {
    await mustCheckIn(); await mustCheckIn();
    assert.equal((await callNext(fx.asha)).status, 200);
    assert.equal((await callNext(fx.asha)).status, 409);
  });
  t('staff board lists sections and filters', async () => {
    const a = await mustCheckIn({ customerName: 'Zed Alpha' });
    await mustCheckIn({ customerName: 'Mia Beta', serviceIds: [fx.colour] });
    const all = (await call('GET', '/staff/queue')).body;
    assert.equal(all.sections.waiting.length, 2);
    assert.equal((await call('GET', `/staff/queue?service=${fx.colour}`)).body.sections.waiting.length, 1);
    assert.equal((await call('GET', '/staff/queue?search=zed')).body.sections.waiting[0].id, a.id);
    assert.equal((await call('GET', `/staff/queue?search=${a.token}`)).body.sections.waiting.length, 1);
  });
});

describe('public display', () => {
  t('shows serving + up next and never exposes personal data', async () => {
    await mustCheckIn({ customerName: 'Secret Person', phone: '9812345678' });
    await mustCheckIn({ customerName: 'Another Person' });
    await callNext();
    const r = await call('GET', '/display');
    assert.equal(r.status, 200);
    assert.equal(r.body.nowServing.length, 1);
    assert.equal(r.body.upNext.length, 1);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes('Secret') && !text.includes('9812345678') && !text.includes('Another'));
  });
  t('completed, cancelled and no-show entries disappear; empty queue is fine', async () => {
    const e = await mustCheckIn();
    await callNext(); await staff(e.id, 'start'); await staff(e.id, 'complete');
    const c = await mustCheckIn(); await call('POST', `/customer/queue/${c.id}/cancel`);
    const r = (await call('GET', '/display')).body;
    assert.deepEqual([r.nowServing.length, r.upNext.length, r.waitingCount], [0, 0, 0]);
  });
});

describe('admin: services', () => {
  const svc = { name: 'Head Massage', category: 'Grooming', description: 'Relax', price: 400, durationMinutes: 20, available: true };
  t('create, list (appears for customers), edit, toggle, delete', async () => {
    const created = await call('POST', '/admin/services', svc);
    assert.equal(created.status, 201);
    const id = created.body.service.id;
    assert.ok((await call('GET', '/services')).body.services.some((s) => s.id === id));
    assert.equal((await call('PUT', `/admin/services/${id}`, { ...svc, price: 450 })).body.service.price, 450);
    assert.equal((await call('PATCH', `/admin/services/${id}/availability`, { available: false })).body.service.available, false);
    assert.equal((await checkIn({ serviceIds: [id] })).status, 409); // unavailable => customers cannot select
    assert.equal((await call('DELETE', `/admin/services/${id}`)).status, 200);
    assert.ok(!(await call('GET', '/services')).body.services.some((s) => s.id === id));
  });
  t('rejects negative/invalid price and duration, duplicates, bad ids', async () => {
    for (const bad of [{ price: -5 }, { price: 'abc' }, { durationMinutes: 0 }, { durationMinutes: -10 }, { durationMinutes: 1.5 }, { name: '' }, { category: 'Spa' }]) {
      assert.equal((await call('POST', '/admin/services', { ...svc, ...bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal((await call('POST', '/admin/services', { ...svc, name: 'haircut' })).status, 409); // case-insensitive duplicate
    assert.equal((await call('PUT', '/admin/services/nope', svc)).status, 404);
    assert.equal((await call('PATCH', `/admin/services/${fx.cut}/availability`, { available: 'x' })).status, 400);
  });
  t('cannot delete a service that active queue entries use', async () => {
    await mustCheckIn();
    const r = await call('DELETE', `/admin/services/${fx.cut}`);
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'SERVICE_IN_USE');
    assert.equal(await Service.countDocuments({ _id: fx.cut }), 1);
  });
  t('existing entries keep their service after it is deactivated', async () => {
    const e = await mustCheckIn();
    await call('PATCH', `/admin/services/${fx.cut}/availability`, { available: false });
    const r = (await call('GET', `/customer/queue/${e.id}`)).body.entry;
    assert.equal(r.services[0].name, 'Haircut');
    assert.equal(r.status, 'WAITING');
  });
});

describe('admin: stylists', () => {
  t('create / update / availability changes reflect in the queue', async () => {
    const c = await call('POST', '/admin/stylists', { name: 'Dev', specialties: ['Fades'], serviceIds: [fx.cut] });
    assert.equal(c.status, 201);
    assert.equal((await call('POST', '/admin/stylists', { name: '' })).status, 400);
    assert.equal((await call('POST', '/admin/stylists', { name: 'X', serviceIds: ['f'.repeat(24)] })).status, 400);
    assert.equal((await call('PATCH', `/admin/stylists/${c.body.stylist.id}/status`, { status: 'BREAK' })).body.stylist.status, 'BREAK');
    assert.equal((await call('PATCH', `/admin/stylists/${c.body.stylist.id}/status`, { status: 'ASLEEP' })).status, 400);
  });
  t('stylist becoming unavailable while customers wait: estimate becomes unavailable', async () => {
    await Stylist.updateMany({}, { status: 'BREAK' });
    await Stylist.updateOne({ _id: fx.cara }, { status: 'AVAILABLE' });
    const e = await mustCheckIn();
    assert.equal((await call('GET', `/customer/queue/${e.id}`)).body.entry.wait.available, true);
    await call('PATCH', `/admin/stylists/${fx.cara}/status`, { status: 'BREAK' });
    assert.equal((await call('GET', `/customer/queue/${e.id}`)).body.entry.wait.available, false);
  });
  t('safe delete: blocked while serving; waiting customers are released', async () => {
    const pref = await mustCheckIn({ preferredStylistId: fx.ben });
    const serving = await mustCheckIn({ preferredStylistId: fx.asha });
    await Stylist.updateOne({ _id: fx.cara }, { status: 'BREAK' });
    assert.equal((await callNext(fx.asha)).body.entry.id, serving.id);
    const blocked = await call('DELETE', `/admin/stylists/${fx.asha}`);
    assert.equal(blocked.status, 409);
    const ok = await call('DELETE', `/admin/stylists/${fx.ben}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.reassignedCustomers, 1);
    const r = (await call('GET', `/customer/queue/${pref.id}`)).body.entry;
    assert.equal(r.preferredStylist, null);
    assert.equal(r.status, 'WAITING');
  });
  t('removing a skill releases customers who now cannot be served by their stylist', async () => {
  const e = await mustCheckIn({
    preferredStylistId: fx.asha,
    serviceIds: [fx.colour]
  });

  const upd = await call('PUT', `/admin/stylists/${fx.asha}`, {
    name: 'Asha',
    status: 'AVAILABLE',
    serviceIds: [fx.cut],
    specialties: []
  });

  console.log('UPDATE RESPONSE:', JSON.stringify(upd, null, 2));

  assert.equal(upd.status, 200);
  assert.equal(upd.body.reassignedCustomers, 1);

  const result = await call('GET', `/customer/queue/${e.id}`);

  assert.equal(result.body.entry.preferredStylist, null);
  assert.equal(result.body.entry.status, 'WAITING');
});
  t('unknown stylist ids', async () => {
    assert.equal((await call('DELETE', `/admin/stylists/${'a'.repeat(24)}`)).status, 404);
    assert.equal((await call('PATCH', '/staff/stylists/bad/status', { status: 'BREAK' })).status, 404);
  });
});

describe('admin: summary and overview', () => {
  t("today's numbers", async () => {
    const a = await mustCheckIn(), b = await mustCheckIn(), c = await mustCheckIn({ serviceIds: [fx.colour] });
    await callNext(); await staff(a.id, 'start'); await staff(a.id, 'complete');
    await call('POST', `/customer/queue/${c.id}/cancel`);
    const s = (await call('GET', '/admin/overview')).body.summary;
    assert.equal(s.checkedIn, 3);
    assert.equal(s.waiting, 1);
    assert.equal(s.completed, 1);
    assert.equal(s.cancelled, 1);
    assert.equal(s.mostPopularService.name, 'Haircut');
    assert.equal(typeof s.averageWaitMinutes, 'number');
    assert.ok(b);
  });
  t('empty day has null average and no popular service', async () => {
    const s = (await call('GET', '/admin/overview')).body.summary;
    assert.equal(s.checkedIn, 0);
    assert.equal(s.averageWaitMinutes, null);
    assert.equal(s.mostPopularService, null);
  });
});
