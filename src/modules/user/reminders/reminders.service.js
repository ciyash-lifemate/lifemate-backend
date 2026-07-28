import { pool } from '../../../config/db.js';
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}
import { notifyReminderCreated } from '../notifications/notifications.service.js';

const findReminderById = async (id, userId) => {
  const [rows] = await pool.query(
    'SELECT * FROM reminders WHERE id = ? AND user_id = ? AND is_active = TRUE',
    [id, userId]
  );
  return rows[0];
};

export const createReminder = async (
  userId,
  {
    type,
    title,
    description,
    reminderDate,
    reminderTime,
    repeatType,
    dosage,
    recipientMobile,
    wishMessage,
    checklistItems,
    voiceMessage,
  }
) => {
  const [result] = await pool.query(
    `INSERT INTO reminders
      (user_id, type, title, description, reminder_date, reminder_time, repeat_type, dosage,
       recipient_mobile, wish_message, checklist_items, voice_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      type,
      title,
      description || null,
      reminderDate,
      reminderTime || null,
      repeatType || 'none',
      dosage || null,
      recipientMobile || null,
      wishMessage || null,
      checklistItems?.length ? JSON.stringify(checklistItems) : null,
      voiceMessage || null,
    ]
  );

  const reminder = await findReminderById(result.insertId, userId);
  await notifyReminderCreated(userId, reminder);
  return reminder;
};

export const getReminder = async (id, userId) => {
  const reminder = await findReminderById(id, userId);
  if (!reminder) throw new ApiError(404, 'Reminder not found');
  return reminder;
};

export const listReminders = async (userId, { type, from, to, page = 1, pageSize = 50 } = {}) => {
  const params = [userId];
  let where = 'WHERE user_id = ? AND is_active = TRUE';

  if (type) {
    where += ' AND type = ?';
    params.push(type);
  }
  if (from) {
    where += ' AND reminder_date >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND reminder_date <= ?';
    params.push(to);
  }

  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT * FROM reminders ${where} ORDER BY reminder_date ASC, reminder_time ASC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reminders ${where}`, params);
  return { items: rows, total: Number(total), page, pageSize };
};

// reminder_date/reminder_time are plain IST wall-clock values entered on the
// phone, but this DB's session clock (CURDATE()/CURTIME()/NOW()) runs in
// UTC - shifting by +5:30 here converts "now" to the IST calendar day/time
// the reminders were actually meant to compare against. All users are
// assumed to be in India for now; there's no per-user timezone field yet.
const IST_OFFSET_SQL = 'NOW() + INTERVAL 330 MINUTE';

export const listTodayReminders = async (userId) => {
  const [rows] = await pool.query(
    `SELECT * FROM reminders
     WHERE user_id = ? AND is_active = TRUE AND reminder_date = DATE(${IST_OFFSET_SQL})
     ORDER BY reminder_time ASC`,
    [userId]
  );
  return rows;
};

// Groups a date-range listing by reminder_date for the calendar view. Always
// bounded by the from/to month range already, so this asks listReminders for
// a generously large page instead of paging through it - the grid needs
// every reminder in the visible month at once, not a "load more" scroll.
export const listCalendarReminders = async (userId, { from, to }) => {
  const { items } = await listReminders(userId, { from, to, pageSize: 1000 });
  return items.reduce((byDate, reminder) => {
    (byDate[reminder.reminder_date] ||= []).push(reminder);
    return byDate;
  }, {});
};

export const updateReminder = async (
  id,
  userId,
  {
    title,
    description,
    reminderDate,
    reminderTime,
    repeatType,
    dosage,
    recipientMobile,
    wishMessage,
    checklistItems,
    voiceMessage,
  }
) => {
  await getReminder(id, userId);
  await pool.query(
    `UPDATE reminders SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      reminder_date = COALESCE(?, reminder_date),
      reminder_time = COALESCE(?, reminder_time),
      repeat_type = COALESCE(?, repeat_type),
      dosage = COALESCE(?, dosage),
      recipient_mobile = COALESCE(?, recipient_mobile),
      wish_message = COALESCE(?, wish_message),
      checklist_items = COALESCE(?, checklist_items),
      voice_message = COALESCE(?, voice_message),
      -- moving the date/time means "already notified today" no longer
      -- applies to the new schedule, so let the scheduler re-evaluate it
      last_notified_date = IF(? IS NOT NULL OR ? IS NOT NULL, NULL, last_notified_date)
     WHERE id = ? AND user_id = ?`,
    [
      title,
      description,
      reminderDate,
      reminderTime,
      repeatType,
      dosage,
      recipientMobile,
      wishMessage,
      checklistItems ? JSON.stringify(checklistItems) : null,
      voiceMessage,
      reminderDate,
      reminderTime,
      id,
      userId,
    ]
  );
  return findReminderById(id, userId);
};

export const setReminderCompleted = async (id, userId, isCompleted) => {
  await getReminder(id, userId);
  await pool.query('UPDATE reminders SET is_completed = ? WHERE id = ? AND user_id = ?', [
    isCompleted,
    id,
    userId,
  ]);
  return findReminderById(id, userId);
};

export const deleteReminder = async (id, userId) => {
  const [result] = await pool.query(
    'UPDATE reminders SET is_active = FALSE WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  if (result.affectedRows === 0) throw new ApiError(404, 'Reminder not found');
};

// --- background scheduler (see reminders.scheduler.js) ---

// A reminder is "due" once for each occurrence its repeat_type implies,
// gated by last_notified_date so a reminder that's due all day only fires
// once. reminder_time = NULL means "any time today" (fires on the first
// tick after midnight).
export const listDueReminders = async () => {
  const [rows] = await pool.query(
    `SELECT * FROM reminders
     WHERE is_active = TRUE
       AND is_completed = FALSE
       AND (last_notified_date IS NULL OR last_notified_date < DATE(${IST_OFFSET_SQL}))
       AND (reminder_time IS NULL OR reminder_time <= TIME(${IST_OFFSET_SQL}))
       AND (
         (repeat_type = 'none' AND reminder_date = DATE(${IST_OFFSET_SQL}))
         OR repeat_type = 'daily'
         OR (repeat_type = 'weekly' AND DAYOFWEEK(reminder_date) = DAYOFWEEK(${IST_OFFSET_SQL}))
         OR (repeat_type = 'monthly' AND DAY(reminder_date) = DAY(${IST_OFFSET_SQL}))
         OR (repeat_type = 'yearly' AND MONTH(reminder_date) = MONTH(${IST_OFFSET_SQL}) AND DAY(reminder_date) = DAY(${IST_OFFSET_SQL}))
       )`
  );
  return rows;
};

export const markReminderNotified = async (id) => {
  await pool.query(`UPDATE reminders SET last_notified_date = DATE(${IST_OFFSET_SQL}) WHERE id = ?`, [id]);
};
