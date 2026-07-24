import { Router } from 'express';
import {
  validateCreateReminder,
  validateUpdateReminder,
  validateCompleteReminder,
  validateListReminders,
  validateCalendarReminders,
} from './reminders.validation.js';
import {
  createReminder,
  getReminders,
  getTodayReminders,
  getCalendarReminders,
  getReminder,
  updateReminder,
  completeReminder,
  deleteReminder,
} from './reminders.controller.js';

const router = Router();

router.get('/today', getTodayReminders);
router.get('/calendar', validateCalendarReminders, getCalendarReminders);
router.get('/', validateListReminders, getReminders);
router.post('/', validateCreateReminder, createReminder);
router.get('/:id', getReminder);
router.put('/:id', validateUpdateReminder, updateReminder);
router.patch('/:id/complete', validateCompleteReminder, completeReminder);
router.delete('/:id', deleteReminder);

export const reminderRoutes = router;
