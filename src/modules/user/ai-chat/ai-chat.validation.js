import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const sendAiMessageSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
});

const listAiMessagesSchema = Joi.object({
  // A created_at timestamp, not an id - ai_messages ids are AUTO_RANDOM and
  // don't ascend with insertion time, so they can't act as a paging cursor.
  before: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z?$/)
    .messages({ 'string.pattern.base': '"before" must be a message timestamp' }),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export const validateSendAiMessage = validate(sendAiMessageSchema);
export const validateListAiMessages = validate(listAiMessagesSchema, 'query');
