import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const createChatSchema = Joi.object({
  // TiDB's AUTO_RANDOM user ids regularly exceed Number.MAX_SAFE_INTEGER, so
  // this must stay a string all the way to the SQL bind param - Joi.number()
  // (and any Number(...) conversion) silently loses precision above 2^53.
  userId: Joi.string().pattern(/^[0-9]+$/).required().messages({
    'string.pattern.base': '"userId" must be a numeric id',
  }),
});

const sendMessageSchema = Joi.object({
  content: Joi.string().min(1).max(2000),
  messageType: Joi.string()
    .valid('text', 'image', 'video', 'audio', 'voice', 'document', 'location')
    .default('text'),
  mediaUrl: Joi.string().uri().max(500),
  mediaName: Joi.string().max(255),
  mediaSize: Joi.number().integer().positive(),
  mediaMime: Joi.string().max(100),
  mediaDuration: Joi.number().integer().positive(),
  replyToId: Joi.number().integer().positive(),
})
  .or('content', 'mediaUrl')
  .messages({ 'object.missing': 'A message needs text content or a media file' });

const editMessageSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
});

const listMessagesSchema = Joi.object({
  before: Joi.number().integer().positive(),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

const pinChatSchema = Joi.object({
  isPinned: Joi.boolean().required(),
});

export const validateCreateChat = validate(createChatSchema);
export const validateSendMessage = validate(sendMessageSchema);
export const validateEditMessage = validate(editMessageSchema);
export const validateListMessages = validate(listMessagesSchema, 'query');
export const validatePinChat = validate(pinChatSchema);
