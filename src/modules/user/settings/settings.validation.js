import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const updateSettingsSchema = Joi.object({
  pushNotifications: Joi.boolean(),
  reminderNotifications: Joi.boolean(),
  // Must match a channel the mobile app actually creates (see
  // src/utils/notifications.js on the mobile side) - not an open-ended
  // picker, Android can only play a sound bundled into the app at build
  // time, never an arbitrary file off the user's own device.
  notificationSound: Joi.string().valid(
    'default',
    'alert',
    'bell',
    'bells',
    'pop',
    'confirm',
    'positive',
    'doorbell',
    'digital',
    'magic',
    'clear',
    'urgent'
  ),
}).min(1);

export const validateUpdateSettings = validate(updateSettingsSchema);
