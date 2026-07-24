import { Router } from 'express';
import { getAdminStats } from './admin.stats.controller.js';

const router = Router();
router.get('/', getAdminStats);

export const adminStatsRoutes = router;
