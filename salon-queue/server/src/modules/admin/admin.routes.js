import { Router } from 'express';
import { setStylistStatus } from '../staff/staff.controller.js';
import {
  createService,
  createStylist,
  deleteService,
  deleteStylist,
  overview,
  setServiceAvailability,
  updateService,
  updateStylist,
} from './admin.controller.js';

const router = Router();
router.get('/overview', overview);

router.post('/services', createService);
router.put('/services/:id', updateService);
router.patch('/services/:id/availability', setServiceAvailability);
router.delete('/services/:id', deleteService);

router.post('/stylists', createStylist);
router.put('/stylists/:id', updateStylist);
router.patch('/stylists/:id/status', setStylistStatus);
router.delete('/stylists/:id', deleteStylist);

export default router;
