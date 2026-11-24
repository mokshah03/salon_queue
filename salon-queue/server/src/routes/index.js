import { Router } from 'express';
import healthRoutes from './health.routes.js';
import customerRoutes from '../modules/customer/customer.routes.js';
import staffRoutes from '../modules/staff/staff.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import displayRoutes from '../modules/display/display.routes.js';
import { getPublicSettings, listServices, listStylists } from '../controllers/catalog.controller.js';

const router = Router();

router.use('/health', healthRoutes);

// Shared read-only catalogue used by Customer, Staff and Admin screens.
router.get('/services', listServices);
router.get('/stylists', listStylists);
router.get('/settings', getPublicSettings);

router.use('/customer', customerRoutes);
router.use('/staff', staffRoutes);
router.use('/admin', adminRoutes);
router.use('/display', displayRoutes);

export default router;
