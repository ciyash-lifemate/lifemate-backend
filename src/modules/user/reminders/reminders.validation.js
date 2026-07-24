import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const REMINDER_TYPES = ['medicine', 'birthday', 'anniversary', 'note', 'task', 'custom'];
const REPEAT_TYPES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createReminderSchema = Joi.object({
  type: Joi.string().valid(...REMINDER_TYPES).required(),
  title: Joi.string().min(1).max(150).required(),
  description: Joi.string().max(1000).allow('', null),
  reminderDate: Joi.date().iso().required(),
  reminderTime: Joi.string().pattern(TIME_PATTERN).allow(null)
    .messages({ 'string.pattern.base': 'reminderTime must be in HH:mm format' }),
  repeatType: Joi.string().valid(...REPEAT_TYPES).default('none'),
  dosage: Joi.string().max(50).allow('', null),
});

const updateReminderSchema = Joi.object({
  title: Joi.string().min(1).max(150),
  description: Joi.string().max(1000).allow('', null),
  reminderDate: Joi.date().iso(),
  reminderTime: Joi.string().pattern(TIME_PATTERN).allow(null),
  repeatType: Joi.string().valid(...REPEAT_TYPES),
  dosage: Joi.string().max(50).allow('', null),
}).min(1);

const completeReminderSchema = Joi.object({
  isCompleted: Joi.boolean().required(),
});

const listRemindersSchema = Joi.object({
  type: Joi.string().valid(...REMINDER_TYPES),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
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
