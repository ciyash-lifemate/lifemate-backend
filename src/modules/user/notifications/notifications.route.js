import { Router } from 'express';
import { validateListNotifications, validateDeviceToken } from './notifications.validation.js';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  registerDeviceToken,
  unregisterDeviceToken,
} from './notifications.controller.js';

const router = Router();

router.get('/', validateListNotifications, getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);
router.post('/device-token', validateDeviceToken, registerDeviceToken);
router.delete('/device-token', validateDeviceToken, unregisterDeviceToken);

export const notificationRoutes = router;
