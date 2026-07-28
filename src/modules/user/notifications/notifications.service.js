import { pool } from '../../../config/db.js';
import { sendExpoPush } from '../../../utils/push.js';
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

export const listNotifications = async (userId, { type, page = 1, pageSize = 30 } = {}) => {
  const params = [userId];
  let where = 'WHERE user_id = ?';
  if (type && type !== 'all') {
    where += ' AND type = ?';
    params.push(type);
  }

  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notifications ${where}`, params);
  return { items: rows, total: Number(total), page, pageSize };
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

// Called by reminders.scheduler.js when a reminder falls due - always pushes
// if the setting allows it, since it's a timed alarm, not a "you missed
// something" nudge.
export const notifyReminderDue = async (
  userId,
  { title, body, referenceId, reminderType, recipientName, recipientMobile, wishMessage, voiceMessage }
) => {
  const notification = await insertNotification({ userId, type: 'reminder', title, body, referenceId });

  if (await pushEnabledFor(userId, 'reminder_notifications')) {
    await sendExpoPush(userId, {
      title,
      body,
      // recipientMobile/wishMessage/recipientName are only set on
      // birthday/anniversary reminders configured with a wish - the app uses
      // these to offer a one-tap "send via WhatsApp" action on tap, since
      // there's no way to auto-send through the real WhatsApp app.
      // voiceMessage is read aloud on-device once the notification's own
      // alert sound finishes (see _layout.js's notification-received handler).
      data: {
        type: 'reminder',
        reminderId: referenceId,
        reminderType,
        recipientName,
        recipientMobile,
        wishMessage,
        voiceMessage,
      },
    });
  }

  return notification;
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
