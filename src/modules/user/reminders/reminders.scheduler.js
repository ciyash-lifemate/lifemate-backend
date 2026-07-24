import * as remindersService from './reminders.service.js';
import { notifyReminderDue } from '../notifications/notifications.service.js';
import { logger } from '../../../utils/logger.js';

const CHECK_INTERVAL_MS = 60_000;

const EMOJI_BY_TYPE = {
  medicine: '💊',
  birthday: '🎂',
  anniversary: '💍',
  task: '✅',
  note: '📝',
  custom: '⏰',
};

const buildAlertCopy = (reminder) => {
  const emoji = EMOJI_BY_TYPE[reminder.type] || '⏰';
  const body =
    reminder.type === 'medicine' && reminder.dosage
      ? `Time to take: ${reminder.dosage}`
      : reminder.description || 'Reminder time!';
  return { title: `${emoji} ${reminder.title}`, body };
};

// Runs server-side (not a client-scheduled local notification) so a
// reminder still fires as a push even if the app was killed, the device
// rebooted, or the reminder was created from a different device entirely -
// the client only needs to hold a valid Expo push token (see
// modules/user/notifications for the register/unregister endpoints).
const checkDueReminders = async () => {
  const due = await remindersService.listDueReminders();

  for (const reminder of due) {
    try {
      const { title, body } = buildAlertCopy(reminder);
      await notifyReminderDue(reminder.user_id, {
        title,
        body,
        referenceId: reminder.id,
        reminderType: reminder.type,
      });
      await remindersService.markReminderNotified(reminder.id);
    } catch (err) {
      logger.error('Failed to send reminder notification', {
        message: err.message,
        reminderId: reminder.id,
      });
    }
  }
};

const tick = () => {
  checkDueReminders().catch((err) => logger.error('Reminder scheduler tick failed', { message: err.message }));
};

export const startReminderScheduler = () => {
  tick(); // covers anything due while the server was offline
  setInterval(tick, CHECK_INTERVAL_MS);
};
