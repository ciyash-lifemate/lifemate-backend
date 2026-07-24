import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const listNotificationsSchema = Joi.object({
  type: Joi.string().valid('all', 'reminder', 'chat', 'system').default('all'),
});

const deviceTokenSchema = Joi.object({
  token: Joi.string().min(1).max(255).required(),
  platform: Joi.string().valid('ios', 'android', 'web').default('android'),
});

export const validateListNotifications = validate(listNotificationsSchema, 'query');
export const validateDeviceToken = validate(deviceTokenSchema);
