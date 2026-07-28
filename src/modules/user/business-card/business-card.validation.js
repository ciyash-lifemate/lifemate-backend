import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const MOBILE_PATTERN = /^\+?[1-9]\d{7,14}$/;

// Must match the ids in mobile:src/constants/cardTemplates.js.
const CARD_TEMPLATES = [
  'navy', 'minimal', 'ocean', 'sunset', 'emerald', 'royal', 'charcoal', 'coral', 'slate', 'rosegold',
  'crimson', 'sapphire', 'mint', 'graphite', 'peach', 'indigo', 'lagoon', 'amber', 'orchid', 'forest',
  'blush', 'steel', 'cocoa', 'citrus', 'plum', 'arctic', 'ember', 'sage', 'cobalt', 'champagne',
  'corporate',
];

const updateBusinessCardSchema = Joi.object({
  cardName: Joi.string().max(100).allow('', null),
  cardDesignation: Joi.string().max(100).allow('', null),
  cardCompany: Joi.string().max(150).allow('', null),
  cardPhone: Joi.string().pattern(MOBILE_PATTERN).allow('', null)
    .messages({ 'string.pattern.base': 'cardPhone must be a valid number with country code' }),
  cardEmail: Joi.string().email().allow('', null),
  // Free text, not Joi.string().uri() - people commonly write "www.site.com"
  // on a visiting card with no http(s):// scheme, which uri() would reject.
  cardWebsite: Joi.string().max(255).allow('', null),
  cardAddress: Joi.string().max(255).allow('', null),
  cardTemplate: Joi.string().valid(...CARD_TEMPLATES).allow(null),
});

export const validateUpdateBusinessCard = validate(updateBusinessCardSchema);
