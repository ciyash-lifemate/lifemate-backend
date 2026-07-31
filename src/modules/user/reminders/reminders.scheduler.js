import * as remindersService from './reminders.service.js';
import { notifyReminderDue } from '../notifications/notifications.service.js';
import { logger } from '../../../utils/logger.js';

// Was 15s - tightened since this is the only path a reminder shared with
// someone else fires through (their device can't schedule a local alarm on
// its own, see the comment on targetUserIds below), so this poll gap was
// direct, felt delay on top of push delivery latency, not just internal
// bookkeeping slack.
const CHECK_INTERVAL_MS = 5_000;

const EMOJI_BY_TYPE = {
  medicine: '💊',
  birthday: '🎂',
  anniversary: '💍',
  task: '✅',
  note: '📝',
  custom: '📌',
  event: '📅',
  alarm: '⏰',
  company: '🏢',
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
      const alertData = {
        title,
        body,
        referenceId: reminder.id,
        reminderType: reminder.type,
        recipientName: reminder.title,
        recipientMobile: reminder.recipient_mobile,
        wishMessage: reminder.wish_message,
        voiceMessage: reminder.voice_message,
        groupId: reminder.group_id,
        projectId: reminder.project_id,
      };

      // Group reminders fan out to every group member, honoring the
      // creator's self-reminder toggle (see getGroupTargetUserIds).
      //
      // Non-group reminders no longer push to their own owner here - the
      // mobile app now schedules an on-device local notification for the
      // owner at save time (see src/utils/localReminders.js), which fires
      // with no network needed and would double-alert alongside this push
      // if we kept notifying the owner too. Shared recipients (see
      // reminder_recipients) still only ever get a server push - a local
      // notification can't be scheduled on someone else's device.
      const targetUserIds = reminder.group_id
        ? await remindersService.getGroupTargetUserIds(reminder.group_id)
        : await remindersService.getRecipientUserIds(reminder.id);
      for (const targetUserId of targetUserIds) {
        await notifyReminderDue(targetUserId, alertData);
      }
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
