import { asyncHandler } from '../../utils/asyncHandler.js';
import { checkIn, getEntryView, transitionEntry } from '../../services/queueService.js';

export const createEntry = asyncHandler(async (req, res) => {
  const { entry, duplicate } = await checkIn(req.body);
  res.status(duplicate ? 200 : 201).json({ entry, duplicate });
});

export const getEntry = asyncHandler(async (req, res) => {
  res.json({ entry: await getEntryView(req.params.id) });
});

// Customers may only cancel while WAITING (enforced atomically in transitionEntry).
export const cancelEntry = asyncHandler(async (req, res) => {
  await transitionEntry(req.params.id, 'CANCELLED', { note: 'Cancelled by customer' });
  res.json({ entry: await getEntryView(req.params.id) });
});
