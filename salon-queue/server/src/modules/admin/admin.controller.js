import Service from '../../models/Service.js';
import Stylist from '../../models/Stylist.js';
import QueueEntry from '../../models/QueueEntry.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { isObjectId, validateService, validateStylist } from '../../utils/validators.js';
import { ACTIVE_STATUSES, stylistCanPerform } from '../../utils/queueLogic.js';
import { buildSummary, buildView, loadDay, stylistsWithActivity } from '../../services/queueService.js';
import { toService, toStylist } from '../../controllers/catalog.controller.js';

const NAME_COLLATION = { locale: 'en', strength: 2 };
const requireId = (id, what) => {
  if (!isObjectId(id)) throw new AppError(404, `${what} not found.`);
};

// ---------------------------------------------------------------- overview
export const overview = asyncHandler(async (req, res) => {
  const day = await loadDay();
  res.json({
    date: day.dateKey,
    summary: buildSummary(day.all),
    stylists: stylistsWithActivity(day),
    queue: [...day.all].reverse().map((e) => buildView(e, day, { includePhone: true })),
  });
});

// ---------------------------------------------------------------- services
export const createService = asyncHandler(async (req, res) => {
  const data = validateService(req.body);
  if (await Service.findOne({ name: data.name }).collation(NAME_COLLATION).lean()) {
    throw new AppError(409, 'A service with this name already exists.', { errors: { name: 'Name already in use.' } });
  }
  const created = await Service.create(data);
  res.status(201).json({ service: toService(created.toObject()) });
});

export const updateService = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'Service');
  const data = validateService(req.body);
  const clash = await Service.findOne({ name: data.name, _id: { $ne: req.params.id } }).collation(NAME_COLLATION).lean();
  if (clash) throw new AppError(409, 'A service with this name already exists.', { errors: { name: 'Name already in use.' } });
  const updated = await Service.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).lean();
  if (!updated) throw new AppError(404, 'Service not found.');
  res.json({ service: toService(updated) });
});

export const setServiceAvailability = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'Service');
  if (typeof req.body?.available !== 'boolean') throw new AppError(400, 'Availability must be true or false.');
  const updated = await Service.findByIdAndUpdate(req.params.id, { available: req.body.available }, { new: true }).lean();
  if (!updated) throw new AppError(404, 'Service not found.');
  res.json({ service: toService(updated) });
});

export const deleteService = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'Service');
  const inUse = await QueueEntry.countDocuments({ 'services.serviceId': req.params.id, status: { $in: ACTIVE_STATUSES } });
  if (inUse) {
    throw new AppError(409, `${inUse} active queue ${inUse === 1 ? 'entry uses' : 'entries use'} this service. Mark it unavailable instead, or delete it after they are done.`, {
      code: 'SERVICE_IN_USE',
    });
  }
  const removed = await Service.findByIdAndDelete(req.params.id).lean();
  if (!removed) throw new AppError(404, 'Service not found.');
  await Stylist.updateMany({ serviceIds: removed._id }, { $pull: { serviceIds: removed._id } });
  res.json({ deleted: true });
});

// ---------------------------------------------------------------- stylists
async function assertServicesExist(ids) {
  if (!ids.length) return;
  const n = await Service.countDocuments({ _id: { $in: ids } });
  if (n !== ids.length) throw new AppError(400, 'One or more selected services do not exist.', { errors: { serviceIds: 'Unknown service selected.' } });
}

export const createStylist = asyncHandler(async (req, res) => {
  const data = validateStylist(req.body);
  await assertServicesExist(data.serviceIds);
  const created = await Stylist.create(data);
  res.status(201).json({ stylist: toStylist(created.toObject()) });
});

export const updateStylist = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'Stylist');
  const data = validateStylist(req.body);
  await assertServicesExist(data.serviceIds);
  const updated = await Stylist.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).lean();
  if (!updated) throw new AppError(404, 'Stylist not found.');

  // If the stylist can no longer perform a service a customer is waiting for, release that
  // customer to "any available stylist" so they are never stuck behind an ineligible stylist.
  const pending = await QueueEntry.find({ preferredStylist: id, status: { $in: ['WAITING', 'NO_SHOW'] } }).lean();
  const stuck = pending.filter((e) => !stylistCanPerform(updated, e.services.map((s) => s.serviceId))).map((e) => e._id);
  if (stuck.length) {
    await QueueEntry.updateMany(
      { _id: { $in: stuck } },
      { $set: { preferredStylist: null }, $push: { history: { status: 'WAITING', at: new Date(), note: `${updated.name} no longer performs these services; now any available stylist` } } }
    );
  }
  res.json({ stylist: toStylist(updated), reassignedCustomers: stuck.length });
});

// Safe delete: blocked while the stylist is serving someone; waiting customers who
// requested this stylist are moved to "any available stylist" and the change is logged.
export const deleteStylist = asyncHandler(async (req, res) => {
  requireId(req.params.id, 'Stylist');
  const id = req.params.id;
  const serving = await QueueEntry.countDocuments({ assignedStylist: id, status: { $in: ['CALLED', 'IN_SERVICE'] } });
  if (serving) {
    throw new AppError(409, 'This stylist currently has a called or in-service customer. Finish or reassign those first.', { code: 'STYLIST_BUSY' });
  }
  const stylist = await Stylist.findById(id).lean();
  if (!stylist) throw new AppError(404, 'Stylist not found.');
  const now = new Date();
  const moved = await QueueEntry.updateMany(
    { preferredStylist: id, status: { $in: ['WAITING', 'NO_SHOW'] } },
    { $set: { preferredStylist: null }, $push: { history: { status: 'WAITING', at: now, note: `Stylist ${stylist.name} removed; now any available stylist` } } }
  );
  await Stylist.findByIdAndDelete(id);
  res.json({ deleted: true, reassignedCustomers: moved.modifiedCount });
});
