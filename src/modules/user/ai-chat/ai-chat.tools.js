// Tools the AI assistant can call on the user's behalf, plus their executors.
// Every executor takes the acting userId from the request - never from the
// model - so a prompt-injected message can't make it touch another account.

import * as reminderService from '../reminders/reminders.service.js';

const REPEAT_TYPES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export const toolDeclarations = [
  {
    functionDeclarations: [
      {
        name: 'create_reminder',
        description:
          'Create a reminder for the user. Use this whenever they ask to be reminded of, ' +
          'scheduled for, or to not forget something.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short title, e.g. "Pay electricity bill".' },
            description: { type: 'string', description: 'Optional extra detail.' },
            reminderDate: { type: 'string', description: 'Due date as YYYY-MM-DD.' },
            reminderTime: { type: 'string', description: 'Optional time of day as HH:MM in 24-hour form.' },
            repeatType: { type: 'string', enum: REPEAT_TYPES, description: 'Defaults to "none".' },
          },
          required: ['title', 'reminderDate'],
        },
      },
      {
        name: 'list_reminders',
        description:
          "Look up the user's existing reminders. Call this before deleting or completing one so " +
          'you know its id, and whenever they ask what they have coming up.',
        parameters: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Optional start date filter, YYYY-MM-DD.' },
            to: { type: 'string', description: 'Optional end date filter, YYYY-MM-DD.' },
          },
        },
      },
      {
        name: 'delete_reminder',
        description: 'Delete one reminder by id. Get the id from list_reminders first.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'number', description: 'The reminder id.' } },
          required: ['id'],
        },
      },
      {
        name: 'complete_reminder',
        description: 'Mark a reminder done (or undone). Get the id from list_reminders first.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'The reminder id.' },
            isCompleted: { type: 'boolean', description: 'Defaults to true.' },
          },
          required: ['id'],
        },
      },
    ],
  },
];

// Trimmed down from the full DB row - the model only needs enough to identify
// a reminder and talk about it, and every extra column is prompt tokens.
const summarize = (r) => ({
  id: r.id,
  title: r.title,
  date: r.reminder_date,
  time: r.reminder_time,
  repeat: r.repeat_type,
  completed: Boolean(r.is_completed),
});

const executors = {
  create_reminder: async (userId, args) => {
    const reminder = await reminderService.createReminder(userId, {
      type: 'custom',
      title: args.title,
      description: args.description,
      reminderDate: args.reminderDate,
      reminderTime: args.reminderTime || null,
      repeatType: REPEAT_TYPES.includes(args.repeatType) ? args.repeatType : 'none',
    });
    return { created: summarize(reminder) };
  },

  list_reminders: async (userId, args) => {
    const reminders = await reminderService.listReminders(userId, {
      from: args.from,
      to: args.to,
      pageSize: 50,
    });
    return { reminders: reminders.map(summarize) };
  },

  delete_reminder: async (userId, args) => {
    await reminderService.deleteReminder(args.id, userId);
    return { deleted: true, id: args.id };
  },

  complete_reminder: async (userId, args) => {
    const reminder = await reminderService.setReminderCompleted(
      args.id,
      userId,
      args.isCompleted !== false
    );
    return { updated: summarize(reminder) };
  },
};

/**
 * Runs one model-requested tool call. Failures are returned as an `error`
 * payload rather than thrown: the model gets to see "reminder not found" and
 * explain it to the user, instead of the whole chat turn 500-ing.
 */
export const runTool = async (userId, { name, args = {} }) => {
  const executor = executors[name];
  if (!executor) return { error: `Unknown tool: ${name}` };

  try {
    return await executor(userId, args);
  } catch (err) {
    return { error: err.message || 'Tool call failed' };
  }
};
