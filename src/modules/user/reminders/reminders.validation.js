import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const REMINDER_TYPES = ['medicine', 'birthday', 'anniversary', 'note', 'task', 'custom', 'recharge', 'event', 'alarm'];
const REPEAT_TYPES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Same pattern user-auth uses for mobile numbers (country code + number).
const MOBILE_PATTERN = /^\+?[1-9]\d{7,14}$/;

// Agenda/todo items on an event-or-meeting reminder - generic and optional
// like dosage/wishMessage rather than type-restricted (see migrate.mjs).
const checklistItemsSchema = Joi.array()
  .items(
    Joi.object({
      text: Joi.string().min(1).max(200).required(),
      done: Joi.boolean().default(false),
    })
  )
  .max(30)
  .allow(null);

const createReminderSchema = Joi.object({
  type: Joi.string().valid(...REMINDER_TYPES).required(),
  title: Joi.string().min(1).max(150).required(),
  description: Joi.string().max(1000).allow('', null),
  reminderDate: Joi.date().iso().required(),
  reminderTime: Joi.string().pattern(TIME_PATTERN).allow(null)
    .messages({ 'string.pattern.base': 'reminderTime must be in HH:mm format' }),
  repeatType: Joi.string().valid(...REPEAT_TYPES).default('none'),
  dosage: Joi.string().max(50).allow('', null),
  recipientMobile: Joi.string().pattern(MOBILE_PATTERN).allow('', null)
    .messages({ 'string.pattern.base': 'recipientMobile must be a valid number with country code' }),
  wishMessage: Joi.string().max(500).allow('', null),
  checklistItems: checklistItemsSchema,
  voiceMessage: Joi.string().max(500).allow('', null),
});

const updateReminderSchema = Joi.object({
  title: Joi.string().min(1).max(150),
  description: Joi.string().max(1000).allow('', null),
  reminderDate: Joi.date().iso(),
  reminderTime: Joi.string().pattern(TIME_PATTERN).allow(null),
  repeatType: Joi.string().valid(...REPEAT_TYPES),
  dosage: Joi.string().max(50).allow('', null),
  recipientMobile: Joi.string().pattern(MOBILE_PATTERN).allow('', null),
  wishMessage: Joi.string().max(500).allow('', null),
  checklistItems: checklistItemsSchema,
  voiceMessage: Joi.string().max(500).allow('', null),
}).min(1);

const completeReminderSchema = Joi.object({
  isCompleted: Joi.boolean().required(),
});

const listRemindersSchema = Joi.object({
  type: Joi.string().valid(...REMINDER_TYPES),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(50),
});

const calendarRemindersSchema = Joi.object({
  from: Joi.date().iso().required(),
  to: Joi.date().iso().required(),
});

export const validateCreateReminder = validate(createReminderSchema);
export const validateUpdateReminder = validate(updateReminderSchema);
export const validateCompleteReminder = validate(completeReminderSchema);
export const validateListReminders = validate(listRemindersSchema, 'query');
export const validateCalendarReminders = validate(calendarRemindersSchema, 'query');
