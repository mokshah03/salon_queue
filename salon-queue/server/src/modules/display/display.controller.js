import { asyncHandler } from '../../utils/asyncHandler.js';
import { getDisplay } from '../../services/queueService.js';

export const display = asyncHandler(async (req, res) => {
  res.json(await getDisplay());
});
