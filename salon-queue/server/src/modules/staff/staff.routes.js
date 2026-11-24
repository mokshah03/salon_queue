import { Router } from 'express';
import { board, callNextCustomer, runAction, setStylistStatus } from './staff.controller.js';

const router = Router();
router.get('/queue', board);
router.post('/call-next', callNextCustomer);
router.post('/queue/:id/:action', runAction);
router.patch('/stylists/:id/status', setStylistStatus);

export default router;
