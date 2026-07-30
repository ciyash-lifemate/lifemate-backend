import { pool } from '../../../config/db.js';
import { sendExpoPush } from '../../../utils/push.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

// Last 10 digits, so "+91 98765 43210", "09876543210" and "9876543210" (a
// device contact saved with or without the country code/leading 0, in any
// punctuation) all normalize to the same key as how the number was stored
// at signup (user.auth.service.js takes it as typed on the OTP screen).
const normalize = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

// The client sends its whole local contact list's phone numbers up just to
// find out which ones are already LifeMate users - nothing else about those
// contacts (names, other numbers) is stored or looked at server-side, and
// the response only ever contains registered users' own public info.
export const matchContacts = async (userId, phones) => {
  const wanted = new Set(phones.map(normalize).filter((d) => d.length === 10));
  if (!wanted.size) return [];

  const [rows] = await pool.query('SELECT id, name, avatar_url, mobile FROM users WHERE id != ? AND mobile IS NOT NULL', [
    userId,
  ]);
  return rows.filter((u) => wanted.has(normalize(u.mobile))).map((u) => ({
    id: u.id,
    name: u.name,
    avatar_url: u.avatar_url,
    mobile: u.mobile,
  }));
};

// A one-off "thinking of you" push - no reminder row is created, just a
// notification, same as tapping the bell next to a LifeMate Contact.
export const sendNudge = async (fromUserId, toUserId) => {
  if (String(fromUserId) === String(toUserId)) throw new ApiError(400, "That's you");

  const [fromRows] = await pool.query('SELECT name FROM users WHERE id = ?', [fromUserId]);
  const [toRows] = await pool.query('SELECT id FROM users WHERE id = ?', [toUserId]);
  if (!toRows[0]) throw new ApiError(404, 'User not found');

  const fromName = fromRows[0]?.name || 'Someone';
  const title = `${fromName} sent you a reminder 👋`;
  const body = 'Just checking in on you!';

  await pool.query(`INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'nudge', ?, ?)`, [
    toUserId,
    title,
    body,
  ]);
  await sendExpoPush(toUserId, { title, body, data: { type: 'nudge' } });
};
