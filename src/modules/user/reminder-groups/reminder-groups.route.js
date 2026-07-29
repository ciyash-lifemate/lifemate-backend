import { Router } from 'express';
import {
  validateCreateGroup,
  validateUpdateGroup,
  validateListGroups,
  validateSelfReminder,
  validateMemberIds,
  validateMemberAccess,
} from './reminder-groups.validation.js';
import {
  createGroup,
  getGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  setSelfReminder,
  addMembers,
  removeMember,
  setMemberAccess,
} from './reminder-groups.controller.js';

const router = Router();

router.get('/', validateListGroups, getGroups);
router.post('/', validateCreateGroup, createGroup);
router.get('/:id', getGroup);
router.put('/:id', validateUpdateGroup, updateGroup);
router.delete('/:id', deleteGroup);
router.patch('/:id/self-reminder', validateSelfReminder, setSelfReminder);
router.post('/:id/members', validateMemberIds, addMembers);
router.delete('/:id/members/:userId', removeMember);
router.patch('/:id/members/:userId/access', validateMemberAccess, setMemberAccess);

export const reminderGroupRoutes = router;
