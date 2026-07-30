import { pool } from '../../../config/db.js';

const findSettingsByUserId = async (userId) => {
  const [rows] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
  return rows[0];
};

export const getSettings = async (userId) => {
  const settings = await findSettingsByUserId(userId);
  if (settings) return settings;

  await pool.query('INSERT INTO user_settings (user_id) VALUES (?)', [userId]);
  return findSettingsByUserId(userId);
};

export const updateSettings = async (userId, { pushNotifications, reminderNotifications, notificationSound }) => {
  await getSettings(userId); // ensure a row exists before updating

  await pool.query(
    `UPDATE user_settings SET
      push_notifications = COALESCE(?, push_notifications),
      reminder_notifications = COALESCE(?, reminder_notifications),
      notification_sound = COALESCE(?, notification_sound)
     WHERE user_id = ?`,
    [pushNotifications, reminderNotifications, notificationSound, userId]
  );
  return findSettingsByUserId(userId);
};
