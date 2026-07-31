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
  {
    title,
    body,
    referenceId,
    reminderType,
    recipientName,
    recipientMobile,
    wishMessage,
    voiceMessage,
    groupId,
    projectId,
  }
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
      // groupId/projectId are only set for Group reminders / Project Tasks -
      // the app's notification-tap handler uses their presence to route to
      // that screen instead of the generic reminder-by-type screen.
      data: {
        type: 'reminder',
        reminderId: referenceId,
        reminderType,
        recipientName,
        recipientMobile,
        wishMessage,
        voiceMessage,
        groupId,
        projectId,
      },
    });
  }

  return notification;
};

// Called right after a Group reminder or Project Task is created (to notify
// the other members/the assignee immediately, not just at the due-date
// alarm) and whenever someone posts a work-log update on a group reminder -
// unlike notifyReminderDue this always fans out to a list of users at once.
export const notifyGroupReminderEvent = async (userIds, { title, body, referenceId, groupId, projectId }) => {
  for (const userId of userIds) {
    await insertNotification({ userId, type: 'reminder', title, body, referenceId });
    if (await pushEnabledFor(userId, 'reminder_notifications')) {
      await sendExpoPush(userId, {
        title,
        body,
        data: { type: 'reminder', reminderId: referenceId, reminderType: groupId ? 'company' : 'task', groupId, projectId },
      });
    }
  }
};

// Called right after a reminder is created with individual recipients (any
// type, via the generic reminder_recipients mechanism - Family Sharing, the
// "also remind" picker, a Project Task's single assignee) so they're
// notified immediately, not just at the due-date alarm. Unlike
// notifyGroupReminderEvent this passes the reminder's own real type instead
// of assuming task/company, so the mobile tap-handler routes to the right
// screen (this path never actually has group_id set, but project_id can be).
export const notifyReminderShared = async (userIds, reminder) => {
  for (const userId of userIds) {
    const title = reminder.title;
    const body = 'Shared a reminder with you';
    await insertNotification({ userId, type: 'reminder', title, body, referenceId: reminder.id });
    if (await pushEnabledFor(userId, 'reminder_notifications')) {
      await sendExpoPush(userId, {
        title,
        body,
        data: {
          type: 'reminder',
          reminderId: reminder.id,
          reminderType: reminder.type,
          recipientMobile: reminder.recipient_mobile,
          wishMessage: reminder.wish_message,
          voiceMessage: reminder.voice_message,
          projectId: reminder.project_id,
        },
      });
    }
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
