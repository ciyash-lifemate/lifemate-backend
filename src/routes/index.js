import { Router } from 'express';
import { userRoutes } from './user.routes.js';
import { adminRoutes } from './admin.routes.js';

const router = Router();

router.use('/user', userRoutes);
router.use('/admin', adminRoutes);

export const apiRoutes = router;
