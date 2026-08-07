import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

// TiDB's AUTO_RANDOM ids regularly exceed Number.MAX_SAFE_INTEGER, so every id
// must stay a string all the way to the SQL bind param - Joi.number() (and any
// Number(...) conversion) silently loses precision above 2^53.
const bigId = Joi.string().pattern(/^[0-9]+$/).messages({
  'string.pattern.base': '{#label} must be a numeric id',
});

const createChatSchema = Joi.object({
  userId: bigId.required(),
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
  replyToId: bigId,
})
  .or('content', 'mediaUrl')
  .messages({ 'object.missing': 'A message needs text content or a media file' });

const editMessageSchema = Joi.object({
  content: Joi.string().min(1).max(2000).required(),
});

const listMessagesSchema = Joi.object({
  // A created_at timestamp, not an id: message ids are AUTO_RANDOM and don't
  // ascend with insertion time, so they can't act as a paging cursor. Accepts
  // the "YYYY-MM-DD HH:mm:ss[.ffffff]" the API itself returns.
  before: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z?$/)
    .messages({ 'string.pattern.base': '"before" must be a message timestamp' }),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

const deleteMessageSchema = Joi.object({
  // "Delete for everyone" wipes the row for both sides and is sender-only;
  // false records a per-user hide instead.
  forEveryone: Joi.boolean().default(true),
});

const pinChatSchema = Joi.object({
  isPinned: Joi.boolean().required(),
});

export const validateCreateChat = validate(createChatSchema);
export const validateSendMessage = validate(sendMessageSchema);
export const validateEditMessage = validate(editMessageSchema);
export const validateListMessages = validate(listMessagesSchema, 'query');
export const validateDeleteMessage = validate(deleteMessageSchema, 'query');
export const validatePinChat = validate(pinChatSchema);
