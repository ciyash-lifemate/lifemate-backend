import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const createCompanySchema = Joi.object({
  name: Joi.string().min(1).max(150).required(),
  notes: Joi.string().max(1000).allow('', null),
});

const updateCompanySchema = Joi.object({
  name: Joi.string().min(1).max(150),
  notes: Joi.string().max(1000).allow('', null),
}).min(1);

export const validateCreateCompany = validate(createCompanySchema);
export const validateUpdateCompany = validate(updateCompanySchema);
