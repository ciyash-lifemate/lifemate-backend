import { Router } from 'express';
import { authenticateAdmin } from '../middlewares/admin.middleware.js';
import { adminAuthRoutes } from '../modules/admin/admin-auth/admin.auth.route.js';
import { bannerAdminRoutes } from '../modules/admin/banners/banners.route.js';
import { adminUsersRoutes } from '../modules/admin/users/admin.users.route.js';
import { adminStatsRoutes } from '../modules/admin/stats/admin.stats.route.js';

const router = Router();

// /auth is intentionally not gated - it's the admin login itself.
router.use('/auth', adminAuthRoutes);

router.use('/banners', authenticateAdmin, bannerAdminRoutes);
router.use('/users', authenticateAdmin, adminUsersRoutes);
router.use('/stats', authenticateAdmin, adminStatsRoutes);

export const adminRoutes = router;
