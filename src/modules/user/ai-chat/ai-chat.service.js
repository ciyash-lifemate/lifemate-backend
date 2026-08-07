import { pool } from '../../../config/db.js';
import * as reminderService from '../reminders/reminders.service.js';
import { generateContent, functionCallsOf, isGeminiConfigured, textOf } from './gemini.client.js';
import { runTool, toolDeclarations } from './ai-chat.tools.js';
import {
  parseReminderIntent,
  parseDeleteIntent,
  matchSmallTalk,
  formatReminderConfirmation,
  FALLBACK_REPLY,
} from './ai-chat.nlu.js';

// How many stored turns to replay as context, and how many tool round-trips a
// single message may take before we stop and answer with whatever we have.
const HISTORY_TURNS = 12;
const MAX_TOOL_ROUNDS = 4;

// Tools that write. Used to decide whether a failed turn can safely be retried
// through the rule-based parser without doubling up on the user's data.
const MUTATING_TOOLS = new Set(['create_reminder', 'delete_reminder', 'complete_reminder']);

const insertAiMessage = async (userId, role, content) => {
  const [result] = await pool.query(
    'INSERT INTO ai_messages (user_id, role, content) VALUES (?, ?, ?)',
    [userId, role, content]
  );
  const [rows] = await pool.query('SELECT * FROM ai_messages WHERE id = ?', [result.insertId]);
  return rows[0];
};

const systemInstruction = () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;

  return [
    'You are LifeMate, a friendly personal reminder assistant inside a mobile app.',
    `Today is ${today} (${now.toLocaleDateString('en-US', { weekday: 'long' })}).`,
    'Resolve relative dates like "tomorrow", "next Friday" or "in 3 days" against that date yourself.',
    'Use the provided tools to actually create, list, delete and complete reminders - never claim you',
    'did something you did not do via a tool call. If a request is missing a date, ask a short',
    'follow-up question instead of guessing. When the user speaks Telugu, Hindi or Hinglish, reply in',
    'the same language. Keep replies short and conversational - this is a chat bubble on a phone, not',
    'an email. No markdown formatting.',
  ].join(' ');
};

// Stored rows -> Gemini's { role, parts } shape. 'assistant' is our own column
// value; Gemini calls the same role 'model'.
const toGeminiHistory = (rows) =>
  rows.map((row) => ({
    role: row.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: row.content }],
  }));

// `performed` collects every tool that actually ran, so the caller can tell a
// turn that changed nothing (safe to retry with the rule-based parser) from one
// that already created or deleted a reminder (retrying would duplicate it).
const generateWithGemini = async (userId, content, history, performed) => {
  const contents = [...toGeminiHistory(history), { role: 'user', parts: [{ text: content }] }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const modelContent = await generateContent(contents, {
      systemInstruction: systemInstruction(),
      tools: toolDeclarations,
    });

    const calls = functionCallsOf(modelContent);
    if (calls.length === 0) return textOf(modelContent);

    // The model turn is pushed back verbatim, parts untouched: Gemini 3 signs
    // its parts with a thoughtSignature and rejects the follow-up request if
    // that signature is missing from the function-call turn.
    contents.push(modelContent);
    const results = await Promise.all(calls.map((call) => runTool(userId, call)));
    calls.forEach((call, i) => performed.push({ name: call.name, result: results[i] }));
    contents.push({
      role: 'user',
      parts: calls.map((call, i) => ({
        functionResponse: { name: call.name, response: results[i] },
      })),
    });
  }

  // Ran out of rounds - ask for a plain answer with the tool results in hand.
  return textOf(await generateContent(contents, { systemInstruction: systemInstruction() }));
};

// Deterministic confirmation built from what the tools actually did, for when
// Gemini performs the work but never produces the closing sentence (an empty
// candidate, or a 429 on the round-trip after the tool call).
const describeToolResults = (performed) => {
  const lines = performed
    .map(({ name, result }) => {
      if (result.error) return `Sorry, that didn't work: ${result.error}`;
      if (name === 'create_reminder') {
        return formatReminderConfirmation({
          title: result.created.title,
          repeatType: result.created.repeat,
          reminderDate: String(result.created.date).slice(0, 10),
          reminderTime: result.created.time,
        });
      }
      if (name === 'delete_reminder') return "Done! I've deleted that reminder.";
      if (name === 'complete_reminder') {
        return result.updated?.completed
          ? `Marked "${result.updated.title}" as done.`
          : `Reopened "${result.updated?.title}".`;
      }
      return null;
    })
    .filter(Boolean);

  return lines.join(' ') || 'Done!';
};

// Pre-Gemini rule-based path. Still the fallback for a missing key or an API
// outage, so a broken Gemini call degrades to the old behaviour rather than
// failing the user's message outright.
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

const generateWithRules = async (userId, content) => {
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

const generateAssistantReply = async (userId, content, history) => {
  if (!isGeminiConfigured()) return generateWithRules(userId, content);

  const performed = [];
  try {
    const reply = await generateWithGemini(userId, content, history, performed);
    if (reply) return reply;
    console.warn('[ai-chat] Gemini returned an empty reply');
  } catch (err) {
    console.error('[ai-chat] Gemini call failed:', err.message);
  }

  // Only re-run the rule-based parser when Gemini changed nothing. Otherwise
  // the reminder it just created would be created a second time. A turn that
  // only read (list_reminders) is safe to retry, so it doesn't count.
  const changedData = performed.some(({ name, result }) => MUTATING_TOOLS.has(name) && !result.error);
  if (changedData) return describeToolResults(performed);
  return generateWithRules(userId, content);
};

// Ordered and paged by created_at, never by id: ai_messages ids are TiDB
// AUTO_RANDOM, whose high bits are random shard bits, so a row written later
// often gets a smaller id. Ordering by id would hand the model - and the
// screen - a shuffled conversation. `before` is therefore a created_at value,
// not an id.
export const listMessages = async (userId, { before, limit = 50 } = {}) => {
  const params = [userId];
  let cursor = '';
  if (before) {
    cursor = 'AND created_at < ?';
    params.push(before);
  }

  const [rows] = await pool.query(
    `SELECT * FROM ai_messages WHERE user_id = ? ${cursor}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    [...params, Number(limit)]
  );
  return rows.reverse();
};

export const sendMessage = async (userId, content) => {
  // Read history before inserting, so the new message isn't duplicated as both
  // the last history turn and the current prompt.
  const history = await listMessages(userId, { limit: HISTORY_TURNS });
  const userMessage = await insertAiMessage(userId, 'user', content);
  const replyText = await generateAssistantReply(userId, content, history);
  const assistantMessage = await insertAiMessage(userId, 'assistant', replyText);

  return { userMessage, assistantMessage };
};
