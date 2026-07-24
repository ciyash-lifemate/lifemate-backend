// Lightweight rule-based parsing for "remind me to ..." style messages.
// Not a real NLU model - just enough pattern matching to turn common phrasing
// ("remind me to pay insurance every month on 5th at 10am") into a reminder.
// Swap this out for a real LLM/NLU provider later without touching the service.

const REPEAT_WORDS = {
  day: 'daily',
  daily: 'daily',
  week: 'weekly',
  weekly: 'weekly',
  month: 'monthly',
  monthly: 'monthly',
  year: 'yearly',
  yearly: 'yearly',
  annually: 'yearly',
};

const ordinal = (day) => {
  if (day % 10 === 1 && day !== 11) return `${day}st`;
  if (day % 10 === 2 && day !== 12) return `${day}nd`;
  if (day % 10 === 3 && day !== 13) return `${day}rd`;
  return `${day}th`;
};

// Formats using local calendar fields (not toISOString, which converts to
// UTC and shifts the date back by a day for any positive UTC offset, e.g. IST).
const toLocalDateString = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const computeReminderDate = (dayOfMonth) => {
  const now = new Date();
  if (!dayOfMonth) return toLocalDateString(now.getFullYear(), now.getMonth(), now.getDate());

  let year = now.getFullYear();
  let month = now.getMonth();
  if (dayOfMonth < now.getDate()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return toLocalDateString(year, month, dayOfMonth);
};

const parseTime = (text) => {
  const match = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const formatTime12h = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${meridiem}`;
};

// Returns { title, repeatType, reminderDate, reminderTime } or null if the
// message doesn't look like a reminder request.
export const parseReminderIntent = (text) => {
  const match = text.match(/remind me to (.+)/i);
  if (!match) return null;

  const body = match[1].trim();

  // "every day/week/month/year" needs the "every"; the -ly forms are
  // unambiguous on their own ("take BP tablet daily").
  const repeatMatch =
    body.match(/every\s+(day|week|month|year)\b/i) ||
    body.match(/\b(daily|weekly|monthly|yearly|annually)\b/i);
  const repeatType = repeatMatch ? REPEAT_WORDS[repeatMatch[1].toLowerCase()] : 'none';

  const dayMatch = body.match(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const dayOfMonth = dayMatch ? Math.min(28, Math.max(1, parseInt(dayMatch[1], 10))) : null;

  const reminderTime = parseTime(body);

  const title = body
    .replace(/\s+every\s+\S+.*$/i, '')
    .replace(/\b(daily|weekly|monthly|yearly|annually)\b/i, '')
    .replace(/\s+on\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?.*$/i, '')
    .replace(/\s+at\s+\d{1,2}(:\d{2})?\s*(am|pm)?.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || body;

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    repeatType: repeatType || 'none',
    reminderDate: computeReminderDate(dayOfMonth),
    reminderTime,
  };
};

export const formatReminderConfirmation = ({ title, repeatType, reminderDate, reminderTime }) => {
  // Parsed straight from the "YYYY-MM-DD" string to avoid Date's UTC parsing
  // shifting the day when the local timezone has a negative UTC offset.
  const day = ordinal(Number(reminderDate.slice(8, 10)));
  const timePart = reminderTime ? ` at ${formatTime12h(reminderTime)}` : '';

  switch (repeatType) {
    case 'monthly':
      return `Sure! I've created a monthly reminder for "${title}" on the ${day} of every month${timePart}.`;
    case 'daily':
      return `Sure! I've created a daily reminder for "${title}"${timePart}.`;
    case 'weekly':
      return `Sure! I've created a weekly reminder for "${title}"${timePart}.`;
    case 'yearly':
      return `Sure! I've created a yearly reminder for "${title}" on the ${day}${timePart}.`;
    default:
      return `Sure! I've created a reminder for "${title}" on ${reminderDate}${timePart}.`;
  }
};

export const FALLBACK_REPLY =
  "I can help you remember things! Try something like \"remind me to pay insurance every month on 5th at 10am\".";

// Small set of canned replies for casual messages that aren't reminder
// requests, so "hi"/"thanks"/"bye" don't get the same reminder-syntax
// instructions as genuinely unrecognized input. Checked after
// parseReminderIntent returns null and before falling back to FALLBACK_REPLY.
const SMALL_TALK = [
  { pattern: /^\s*(hi+|hello+|hey+|yo|hii+|hola)\b/i, reply: 'Hello! 👋 How can I help you today?' },
  { pattern: /how\s+are\s+you/i, reply: "I'm doing great, thanks for asking! What can I help you remember today?" },
  { pattern: /\b(thanks|thank you|thx|ty)\b/i, reply: "You're welcome! Let me know if you need another reminder set up." },
  { pattern: /^\s*(bye|goodbye|see\s+ya|see\s+you|good\s*night)\b/i, reply: "Goodbye! I'll be here whenever you need a reminder." },
  { pattern: /\b(who are you|what can you do|help)\b/i, reply: FALLBACK_REPLY },
];

export const matchSmallTalk = (text) => SMALL_TALK.find(({ pattern }) => pattern.test(text))?.reply || null;

// Matches "delete/remove/cancel [my] reminder [for/to/about] <title>".
// Returns { titleQuery } (titleQuery may be '' if no title was said) or null
// if the message isn't a delete request at all.
export const parseDeleteIntent = (text) => {
  const match = text.match(/\b(?:delete|remove|cancel)\s+(?:my\s+)?reminder\b\s*(?:for|to|about)?\s*(.*)/i);
  if (!match) return null;
  return { titleQuery: match[1].trim() };
};
