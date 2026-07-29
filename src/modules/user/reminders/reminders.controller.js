const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, { statusCode = 200, message, data } = {}) => {
  res.status(statusCode).json({
    success: true,
    ...(message !== undefined && { message }),
    ...(data !== undefined && { data }),
  });
};
import * as remindersService from './reminders.service.js';

export const createReminder = asyncHandler(async (req, res) => {
  const reminder = await remindersService.createReminder(req.userId, req.body);
  sendSuccess(res, { statusCode: 201, data: reminder });
});

export const getReminders = asyncHandler(async (req, res) => {
  const reminders = await remindersService.listReminders(req.userId, req.query);
  sendSuccess(res, { data: reminders });
});

export const getTodayReminders = asyncHandler(async (req, res) => {
  const reminders = await remindersService.listTodayReminders(req.userId);
  sendSuccess(res, { data: reminders });
});

export const getCalendarReminders = asyncHandler(async (req, res) => {
  const byDate = await remindersService.listCalendarReminders(req.userId, req.query);
  sendSuccess(res, { data: byDate });
});

export const getReminder = asyncHandler(async (req, res) => {
  const reminder = await remindersService.getReminder(req.params.id, req.userId);
  sendSuccess(res, { data: reminder });
});

export const updateReminder = asyncHandler(async (req, res) => {
  const reminder = await remindersService.updateReminder(req.params.id, req.userId, req.body);
  sendSuccess(res, { data: reminder });
});

export const completeReminder = asyncHandler(async (req, res) => {
  const reminder = await remindersService.setReminderCompleted(
    req.params.id,
    req.userId,
    req.body.isCompleted
  );
  sendSuccess(res, { data: reminder });
});

export const deleteReminder = asyncHandler(async (req, res) => {
  await remindersService.deleteReminder(req.params.id, req.userId);
  sendSuccess(res, { message: 'Reminder deleted' });
});

export const getReminderUpdates = asyncHandler(async (req, res) => {
  const updates = await remindersService.listReminderUpdates(req.params.id, req.userId);
  sendSuccess(res, { data: updates });
});

export const addReminderUpdate = asyncHandler(async (req, res) => {
  const updates = await remindersService.addReminderUpdate(req.params.id, req.userId, req.body.note);
  sendSuccess(res, { statusCode: 201, data: updates });
});
