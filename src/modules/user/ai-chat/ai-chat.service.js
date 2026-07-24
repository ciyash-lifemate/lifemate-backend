import { pool } from '../../../config/db.js';
import * as reminderService from '../reminders/reminders.service.js';
import {
  parseReminderIntent,
  parseDeleteIntent,
  matchSmallTalk,
  formatReminderConfirmation,
  FALLBACK_REPLY,
} from './ai-chat.nlu.js';

const insertAiMessage = async (userId, role, content) => {
  const [result] = await pool.query(
    'INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)',
    [userId, role, content]
  );
  const [rows] = await pool.query('SELECT * FROM ai_messages WHERE id = ?', [result.insertId]);
  return rows[0];
};

const handleDeleteIntent = async (userId, titleQuery) => {
  if (!titleQuery) return 'Which reminder would you like to delete? Try "delete reminder <name>".';

  const reminders = await reminderService.listReminders(userId, {});
  const matches = reminders.filter((r) => r.title.toLowerCase().includes(titleQuery.toLowerCase()));

  if (matches.length === 0) return `I couldn't find a reminder matching "${titleQuery}".`;
  if (matches.length > 1) {
    return `I found more than one match: ${matches.map((r) => `"${r.title}"`).join(', ')}. Please be more specific.`;
  }

  await reminderService.deleteReminder(matches[0].id, userId);
  return `Done! I've deleted the reminder "${matches[0].title}".`;
};

const generateAssistantReply = async (userId, content) => {
  const deleteIntent = parseDeleteIntent(content);
  if (deleteIntent) return handleDeleteIntent(userId, deleteIntent.titleQuery);

  const intent = parseReminderIntent(content);
  if (intent) {
    const reminder = await reminderService.createReminder(userId, {
      type: 'custom',
      title: intent.title,
      reminderDate: intent.reminderDate,
      reminderTime: intent.reminderTime,
      repeatType: intent.repeatType,
    });
    return formatReminderConfirmation({ ...intent, reminderDate: reminder.reminder_date });
  }

  return matchSmallTalk(content) || FALLBACK_REPLY;
};

export const listMessages = async (userId, { before, limit = 50 } = {}) => {
  const params = [userId];
  let cursor = '';
  if (before) {
    cursor = 'AND id < ?';
    params.push(before);
  }

  const [rows] = await pool.query(
    `SELECT * FROM ai_messages WHERE user_id = ? ${cursor} ORDER BY id DESC LIMIT ?`,
    [...params, Number(limit)]
  );
  return rows.reverse();
};

export const sendMessage = async (userId, content) => {
  const userMessage = await insertAiMessage(userId, 'user', content);
  const replyText = await generateAssistantReply(userId, content);
  const assistantMessage = await insertAiMessage(userId, 'assistant', replyText);

  return { userMessage, assistantMessage };
};
