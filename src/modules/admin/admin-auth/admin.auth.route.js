import { Router } from 'express';
import { authenticateAdmin } from '../../../middlewares/admin.middleware.js';
import { validateLogin } from './admin.auth.validation.js';
import { login, getMe } from './admin.auth.controller.js';

const router = Router();

router.post('/login', validateLogin, login);
router.get('/me', authenticateAdmin, getMe);

export const adminAuthRoutes = router;
