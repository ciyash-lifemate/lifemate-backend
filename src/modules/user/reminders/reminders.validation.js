import Joi from 'joi';
import { validate } from '../../../middlewares/validate.middleware.js';

const REMINDER_TYPES = ['medicine', 'birthday', 'anniversary', 'note', 'task', 'custom', 'recharge', 'event', 'alarm', 'company'];
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

// Other app users this reminder should also be pushed to when due, e.g. a
// Company reminder shared with a colleague or a whole group at once - see
// reminder_recipients table (migrate.mjs) and reminders.scheduler.js.
// String, not number: TiDB's AUTO_RANDOM user ids regularly exceed
// Number.MAX_SAFE_INTEGER, which is why the DB pool reads BIGINT columns
// back as strings (bigNumberStrings in config/db.js) - Joi.number() would
// reject those same ids as "not a safe number".
const recipientUserIdsSchema = Joi.array()
  .items(Joi.string().pattern(/^\d+$/))
  .max(50)
  .allow(null);

// Set when this reminder is posted to a Group instead of being a plain
// personal reminder - see reminders.group_id (migrate.mjs). When present,
// recipientUserIds doesn't apply (the group's members are the recipients).
const groupIdSchema = Joi.string().pattern(/^\d+$/).allow(null);

// Set when this reminder is a Project "Task" - see reminders.project_id
// (migrate.mjs). When present, recipientUserIds is clamped to a single
// assignee in reminders.service.js rather than validated here.
const projectIdSchema = Joi.string().pattern(/^\d+$/).allow(null);

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
  recipientUserIds: recipientUserIdsSchema,
  groupId: groupIdSchema,
  projectId: projectIdSchema,
  selfReminder: Joi.boolean(),
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
  recipientUserIds: recipientUserIdsSchema,
  selfReminder: Joi.boolean(),
}).min(1);

const completeReminderSchema = Joi.object({
  isCompleted: Joi.boolean().required(),
});

const listRemindersSchema = Joi.object({
  type: Joi.string().valid(...REMINDER_TYPES),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  groupId: groupIdSchema,
  projectId: projectIdSchema,
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(50),
});

const calendarRemindersSchema = Joi.object({
  from: Joi.date().iso().required(),
  to: Joi.date().iso().required(),
});

// A work-log entry on a group reminder - see reminder_updates (migrate.mjs).
const addReminderUpdateSchema = Joi.object({
  note: Joi.string().min(1).max(1000).required(),
});

export const validateCreateReminder = validate(createReminderSchema);
export const validateUpdateReminder = validate(updateReminderSchema);
export const validateCompleteReminder = validate(completeReminderSchema);
export const validateListReminders = validate(listRemindersSchema, 'query');
export const validateCalendarReminders = validate(calendarRemindersSchema, 'query');
export const validateAddReminderUpdate = validate(addReminderUpdateSchema);
