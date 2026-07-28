import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const updateSettingsSchema = Joi.object({
  pushNotifications: Joi.boolean(),
  reminderNotifications: Joi.boolean(),
}).min(1);

export const validateUpdateSettings = validate(updateSettingsSchema);
