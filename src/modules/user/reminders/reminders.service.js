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
  { type, title, description, reminderDate, reminderTime, repeatType, dosage }
) => {
  const [result] = await pool.query(
    `INSERT INTO reminders
      (user_id, type, title, description, reminder_date, reminder_time, repeat_type, dosage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, title, description || null, reminderDate, reminderTime || null, repeatType || 'none', dosage || null]
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

export const listReminders = async (userId, { type, from, to } = {}) => {
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

  const [rows] = await pool.query(
    `SELECT * FROM reminders ${where} ORDER BY reminder_date ASC, reminder_time ASC`,
    params
  );
  return rows;
};

export const listTodayReminders = async (userId) => {
  const [rows] = await pool.query(
    `SELECT * FROM reminders
     WHERE user_id = ? AND is_active = TRUE AND reminder_date = CURDATE()
     ORDER BY reminder_time ASC`,
    [userId]
  );
  return rows;
};

// Groups a date-range listing by reminder_date for the calendar view.
export const listCalendarReminders = async (userId, { from, to }) => {
  const reminders = await listReminders(userId, { from, to });
  return reminders.reduce((byDate, reminder) => {
    (byDate[reminder.reminder_date] ||= []).push(reminder);
    return byDate;
  }, {});
};

export const updateReminder = async (id, userId, { title, description, reminderDate, reminderTime, repeatType, dosage }) => {
  await getReminder(id, userId);
  await pool.query(
    `UPDATE reminders SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      reminder_date = COALESCE(?, reminder_date),
      reminder_time = COALESCE(?, reminder_time),
      repeat_type = COALESCE(?, repeat_type),
      dosage = COALESCE(?, dosage),
      -- moving the date/time means "already notified today" no longer
      -- applies to the new schedule, so let the scheduler re-evaluate it
      last_notified_date = IF(? IS NOT NULL OR ? IS NOT NULL, NULL, last_notified_date)
     WHERE id = ? AND user_id = ?`,
    [title, description, reminderDate, reminderTime, repeatType, dosage, reminderDate, reminderTime, id, userId]
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
       AND (last_notified_date IS NULL OR last_notified_date < CURDATE())
       AND (reminder_time IS NULL OR reminder_time <= CURTIME())
       AND (
         (repeat_type = 'none' AND reminder_date = CURDATE())
         OR repeat_type = 'daily'
         OR (repeat_type = 'weekly' AND DAYOFWEEK(reminder_date) = DAYOFWEEK(CURDATE()))
         OR (repeat_type = 'monthly' AND DAY(reminder_date) = DAY(CURDATE()))
         OR (repeat_type = 'yearly' AND MONTH(reminder_date) = MONTH(CURDATE()) AND DAY(reminder_date) = DAY(CURDATE()))
       )`
  );
  return rows;
};

export const markReminderNotified = async (id) => {
  await pool.query('UPDATE reminders SET last_notified_date = CURDATE() WHERE id = ?', [id]);
};
