import { Router } from 'express';
import { getDashboard } from './dashboard.controller.js';

const router = Router();
router.get('/', getDashboard);

export const dashboardRoutes = router;
