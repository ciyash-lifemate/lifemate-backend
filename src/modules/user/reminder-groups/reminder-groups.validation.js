import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const idSchema = Joi.string().pattern(/^\d+$/);
const idListSchema = Joi.array().items(idSchema).max(50);

const createGroupSchema = Joi.object({
  projectId: idSchema.required(),
  name: Joi.string().min(1).max(150).required(),
  memberUserIds: idListSchema.allow(null),
});

const updateGroupSchema = Joi.object({
  name: Joi.string().min(1).max(150).required(),
});

const listGroupsSchema = Joi.object({
  projectId: idSchema.required(),
});

const selfReminderSchema = Joi.object({
  enabled: Joi.boolean().required(),
});

const memberIdsSchema = Joi.object({
  userIds: idListSchema.min(1).required(),
});

const memberAccessSchema = Joi.object({
  enabled: Joi.boolean().required(),
});

export const validateCreateGroup = validate(createGroupSchema);
export const validateUpdateGroup = validate(updateGroupSchema);
export const validateListGroups = validate(listGroupsSchema, 'query');
export const validateSelfReminder = validate(selfReminderSchema);
export const validateMemberIds = validate(memberIdsSchema);
export const validateMemberAccess = validate(memberAccessSchema);
