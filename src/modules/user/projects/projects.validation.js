import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const createProjectSchema = Joi.object({
  companyId: Joi.string().pattern(/^\d+$/).required(),
  name: Joi.string().min(1).max(150).required(),
  notes: Joi.string().max(1000).allow('', null),
});

const updateProjectSchema = Joi.object({
  name: Joi.string().min(1).max(150),
  notes: Joi.string().max(1000).allow('', null),
}).min(1);

const listProjectsSchema = Joi.object({
  companyId: Joi.string().pattern(/^\d+$/).required(),
});

export const validateCreateProject = validate(createProjectSchema);
export const validateUpdateProject = validate(updateProjectSchema);
export const validateListProjects = validate(listProjectsSchema, 'query');
