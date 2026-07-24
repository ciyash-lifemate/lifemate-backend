import { Router } from 'express';
import { authenticateUser } from '../middlewares/user.middleware.js';
import { userAuthRoutes } from '../modules/user/user-auth/user.auth.route.js';
import { dashboardRoutes } from '../modules/user/dashboard/dashboard.route.js';
import { reminderRoutes } from '../modules/user/reminders/reminders.route.js';
import { noteRoutes } from '../modules/user/notes/notes.route.js';
import { notificationRoutes } from '../modules/user/notifications/notifications.route.js';
import { chatRoutes } from '../modules/user/chats/chats.route.js';
import { aiChatRoutes } from '../modules/user/ai-chat/ai-chat.route.js';
import { settingsRoutes } from '../modules/user/settings/settings.route.js';
import { bannerPublicRoutes } from '../modules/admin/banners/banners.route.js';
import { uploadRoutes } from '../modules/user/uploads/uploads.route.js';
import { callRoutes } from '../modules/user/calls/calls.route.js';

const router = Router();

// /auth is intentionally not gated here - OTP send/verify and Google login
// are how a user gets a token in the first place; user.auth.route.js applies
// authenticateUser itself only to the /me and /search routes that need it.
router.use('/auth', userAuthRoutes);
// /banners is the public read-only feed for the app - no login required.
router.use('/banners', bannerPublicRoutes);

router.use('/dashboard', authenticateUser, dashboardRoutes);
router.use('/reminders', authenticateUser, reminderRoutes);
router.use('/notes', authenticateUser, noteRoutes);
router.use('/notifications', authenticateUser, notificationRoutes);
router.use('/chats', authenticateUser, chatRoutes);
router.use('/ai-chat', authenticateUser, aiChatRoutes);
router.use('/settings', authenticateUser, settingsRoutes);
router.use('/uploads', authenticateUser, uploadRoutes);
router.use('/calls', authenticateUser, callRoutes);

export const userRoutes = router;  
