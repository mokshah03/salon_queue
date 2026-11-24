import { Router } from 'express';
import { display } from './display.controller.js';

const router = Router();
router.get('/', display);

export default router;
