import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const updateSettingsSchema = Joi.object({
  pushNotifications: Joi.boolean(),
  reminderNotifications: Joi.boolean(),
  // Either a fixed bundled-sound id (must match a channel the mobile app
  // actually creates - see src/utils/notifications.js on the mobile side),
  // or a "reminders-custom-<timestamp>" channel id for a sound the user
  // picked from their own phone (see modules/reminder-sound) - that channel
  // is created on-device at pick time under a unique id, so the value here
  // has no fixed set to validate against, just the shape.
  notificationSound: Joi.alternatives().try(
    Joi.string().valid(
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
    Joi.string().pattern(/^reminders-custom-\d+$/)
  ),
}).min(1);

export const validateUpdateSettings = validate(updateSettingsSchema);
