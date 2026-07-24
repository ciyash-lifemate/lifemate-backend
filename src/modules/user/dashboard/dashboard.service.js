import * as reminderService from '../reminders/reminders.service.js';
import * as notificationsService from '../notifications/notifications.service.js';

export const getDashboardSummary = async (userId) => {
  const [todayReminders, unreadNotifications] = await Promise.all([
    reminderService.listTodayReminders(userId),
    notificationsService.getUnreadCount(userId),
  ]);

  return {
    todayReminders,
    todayReminderCount: todayReminders.length,
    unreadNotifications,
  };
};
