import Stylist from '../../models/Stylist.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/errors.js';
import { isObjectId, STYLIST_STATUSES } from '../../utils/validators.js';
import { callNext, getEntryView, getStaffBoard, transitionEntry } from '../../services/queueService.js';

export const board = asyncHandler(async (req, res) => {
  const { service, stylist, search } = req.query;
  res.json(await getStaffBoard({ service: isObjectId(service) ? service : '', stylist: isObjectId(stylist) ? stylist : '', search }));
});

export const callNextCustomer = asyncHandler(async (req, res) => {
  const stylistId = req.body?.stylistId || null;
  if (stylistId && !isObjectId(stylistId)) throw new AppError(400, 'Invalid stylist.');
  const called = await callNext({ stylistId });
  res.json({ entry: await getEntryView(called._id, { includePhone: true }) });
});

const ACTIONS = {
  start: ['IN_SERVICE', 'Service started'],
  complete: ['COMPLETED', 'Service completed'],
  'no-show': ['NO_SHOW', 'Marked no-show'],
  return: ['WAITING', 'Returned to queue by staff'],
  cancel: ['CANCELLED', 'Cancelled by staff'],
};

export const runAction = asyncHandler(async (req, res) => {
  const action = ACTIONS[req.params.action];
  if (!action) throw new AppError(404, 'Unknown action.');
  await transitionEntry(req.params.id, action[0], { note: action[1] });
  res.json({ entry: await getEntryView(req.params.id, { includePhone: true }) });
});

export const setStylistStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!STYLIST_STATUSES.includes(status)) throw new AppError(400, 'Invalid availability status.');
  if (!isObjectId(req.params.id)) throw new AppError(404, 'Stylist not found.');
  const stylist = await Stylist.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
  if (!stylist) throw new AppError(404, 'Stylist not found.');
  res.json({ stylist: { id: String(stylist._id), name: stylist.name, status: stylist.status } });
});
