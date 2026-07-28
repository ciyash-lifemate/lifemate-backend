import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const createNoteSchema = Joi.object({
  title: Joi.string().min(1).max(150).required(),
  content: Joi.string().max(5000).allow(''),
  color: Joi.string().max(20).allow('', null),
});

const updateNoteSchema = Joi.object({
  title: Joi.string().min(1).max(150),
  content: Joi.string().max(5000).allow(''),
  color: Joi.string().max(20).allow('', null),
}).min(1);

const listNotesSchema = Joi.object({
  search: Joi.string().max(100).allow(''),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
});

export const validateCreateNote = validate(createNoteSchema);
export const validateUpdateNote = validate(updateNoteSchema);
export const validateListNotes = validate(listNotesSchema, 'query');
