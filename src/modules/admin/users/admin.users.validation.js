import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const listUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().max(100).allow(''),
});

const setActiveSchema = Joi.object({
  isActive: Joi.boolean().required(),
});

export const validateListUsers = validate(listUsersSchema, 'query');
export const validateSetActive = validate(setActiveSchema);
