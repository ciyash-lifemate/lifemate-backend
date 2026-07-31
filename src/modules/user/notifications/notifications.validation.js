import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const listNotificationsSchema = Joi.object({
  // 'sent'/'received' resolve against the reminder a type: 'reminder'
  // notification points to (see the join in notifications.service.js's
  // listNotifications) - 'sent' is one this user created and shared with
  // someone else, 'received' is one someone else shared with this user.
  type: Joi.string().valid('all', 'reminder', 'system', 'sent', 'received').default('all'),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(30),
});

const deviceTokenSchema = Joi.object({
  token: Joi.string().min(1).max(255).required(),
  platform: Joi.string().valid('ios', 'android', 'web').default('android'),
});

export const validateListNotifications = validate(listNotificationsSchema, 'query');
export const validateDeviceToken = validate(deviceTokenSchema);
