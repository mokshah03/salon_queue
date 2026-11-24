import { Router } from 'express';
import { cancelEntry, createEntry, getEntry } from './customer.controller.js';

const router = Router();
router.post('/queue', createEntry);
router.get('/queue/:id', getEntry);
router.post('/queue/:id/cancel', cancelEntry);

export default router;
