import { pool } from '../../../config/db.js';
import { sendExpoPush } from '../../../utils/push.js';
import { isOnline } from '../../../realtime/presence.js';
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const insertNotification = async ({ userId, type, title, body, referenceId }) => {
  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, reference_id)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, title, body || null, referenceId || null]
  );
  const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [result.insertId]);
  return rows[0];
};

export const listNotifications = async (userId, { type } = {}) => {
  const params = [userId];
  let where = 'WHERE user_id = ?';
  if (type && type !== 'all') {
    where += ' AND type = ?';
    params.push(type);
  }

  const [rows] = await pool.query(
    `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 100`,
    params
  );
  return rows;
};

export const getUnreadCount = async (userId) => {
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = FALSE',
    [userId]
  );
  return total;
};

export const markRead = async (id, userId) => {
  const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  if (!rows[0]) throw new ApiError(404, 'Notification not found');

  await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [
    id,
    userId,
  ]);
  return { ...rows[0], is_read: 1 };
};

export const markAllRead = async (userId) => {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE', [
    userId,
  ]);
};

// --- cross-module helpers, called by other services rather than a route ---

export const notifyReminderCreated = (userId, reminder) =>
  insertNotification({
    userId,
    type: 'reminder',
    title: reminder.title,
    body: 'Reminder created',
    referenceId: reminder.id,
  });

const pushEnabledFor = async (userId, column) => {
  const [rows] = await pool.query(
    `SELECT push_notifications, ${column} FROM user_settings WHERE user_id = ?`,
    [userId]
  );
  // No settings row yet = defaults, and the defaults are both TRUE.
  if (!rows[0]) return true;
  return Boolean(rows[0].push_notifications) && Boolean(rows[0][column]);
};

export const notifyNewMessage = async (userId, { chatId, senderName, preview }) => {
  const notification = await insertNotification({
    userId,
    type: 'chat',
    title: senderName,
    body: preview,
    referenceId: chatId,
  });

  // Only push when the recipient has no open socket - if they're connected
  // they already got the message over Socket.IO in realtime.
  if (!isOnline(userId) && (await pushEnabledFor(userId, 'chat_notifications'))) {
    await sendExpoPush(userId, {
      title: senderName,
      body: preview,
      data: { type: 'chat', chatId },
    });
  }

  return notification;
};

// Called by reminders.scheduler.js when a reminder falls due - unlike a chat
// message, this always pushes if the setting allows it (not gated on socket
// presence) since it's a timed alarm, not a "you missed something" nudge.
export const notifyReminderDue = async (userId, { title, body, referenceId, reminderType }) => {
  const notification = await insertNotification({ userId, type: 'reminder', title, body, referenceId });

  if (await pushEnabledFor(userId, 'reminder_notifications')) {
    await sendExpoPush(userId, {
      title,
      body,
      data: { type: 'reminder', reminderId: referenceId, reminderType },
    });
  }

  return notification;
};

export const notifyIncomingCall = async (userId, { chatId, callerName, callType }) => {
  if (await pushEnabledFor(userId, 'chat_notifications')) {
    await sendExpoPush(userId, {
      title: `Incoming ${callType} call`,
      body: callerName,
      data: { type: 'call', chatId, callType },
    });
  }
};

// --- device tokens (Expo push) ---

export const registerDeviceToken = async (userId, token, platform) => {
  await pool.query(
    `INSERT INTO device_tokens (user_id, expo_push_token, platform) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform)`,
    [userId, token, platform]
  );
};

export const unregisterDeviceToken = async (userId, token) => {
  await pool.query('DELETE FROM device_tokens WHERE user_id = ? AND expo_push_token = ?', [
    userId,
    token,
  ]);
};
