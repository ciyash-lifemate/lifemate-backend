import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const sendAiMessageSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
});

const listAiMessagesSchema = Joi.object({
  before: Joi.number().integer().positive(),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export const validateSendAiMessage = validate(sendAiMessageSchema);
export const validateListAiMessages = validate(listAiMessagesSchema, 'query');
