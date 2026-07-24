const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, { statusCode = 200, message, data } = {}) => {
  res.status(statusCode).json({
    success: true,
    ...(message !== undefined && { message }),
    ...(data !== undefined && { data }),
  });
};
import * as notificationsService from './notifications.service.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await notificationsService.listNotifications(req.userId, req.query);
  sendSuccess(res, { data: notifications });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationsService.getUnreadCount(req.userId);
  sendSuccess(res, { data: { count } });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await notificationsService.markRead(req.params.id, req.userId);
  sendSuccess(res, { data: notification });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await notificationsService.markAllRead(req.userId);
  sendSuccess(res, { message: 'All notifications marked as read' });
});

export const registerDeviceToken = asyncHandler(async (req, res) => {
  await notificationsService.registerDeviceToken(req.userId, req.body.token, req.body.platform);
  sendSuccess(res, { statusCode: 201, message: 'Device registered' });
});

export const unregisterDeviceToken = asyncHandler(async (req, res) => {
  await notificationsService.unregisterDeviceToken(req.userId, req.body.token);
  sendSuccess(res, { message: 'Device unregistered' });
});
