import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const matchContactsSchema = Joi.object({
  // Raw as read off the device (any punctuation/spacing) - normalized
  // server-side before comparing, so the client doesn't need to.
  phones: Joi.array().items(Joi.string().min(3).max(30)).max(3000).required(),
});

const nudgeParamSchema = Joi.object({
  userId: Joi.string().pattern(/^\d+$/).required(),
});

export const validateMatchContacts = validate(matchContactsSchema);
export const validateNudgeParam = validate(nudgeParamSchema, 'params');
