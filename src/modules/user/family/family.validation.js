import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const PERMISSIONS = ['view', 'edit', 'add', 'full'];
const MOBILE_PATTERN = /^\+?[1-9]\d{7,14}$/;

const createGroupSchema = Joi.object({
  name: Joi.string().min(1).max(100).default('My Family'),
});

const updateGroupSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
});

const inviteMemberSchema = Joi.object({
  mobile: Joi.string()
    .pattern(MOBILE_PATTERN)
    .required()
    .messages({ 'string.pattern.base': 'mobile must be a valid number with country code' }),
  permission: Joi.string().valid(...PERMISSIONS).default('view'),
});

const updateMemberSchema = Joi.object({
  permission: Joi.string().valid(...PERMISSIONS).required(),
});

const memberIdParamSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required(),
});

const listSharedRemindersSchema = Joi.object({
  filter: Joi.string().valid('all', 'mine', 'shared').default('all'),
});

export const validateCreateGroup = validate(createGroupSchema);
export const validateUpdateGroup = validate(updateGroupSchema);
export const validateInviteMember = validate(inviteMemberSchema);
export const validateUpdateMember = validate(updateMemberSchema);
export const validateMemberIdParam = validate(memberIdParamSchema, 'params');
export const validateListSharedReminders = validate(listSharedRemindersSchema, 'query');
