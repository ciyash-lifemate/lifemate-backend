import { Router } from 'express';
import {
  validateCreateGroup,
  validateUpdateGroup,
  validateInviteMember,
  validateUpdateMember,
  validateMemberIdParam,
  validateListSharedReminders,
} from './family.validation.js';
import {
  getMyGroup,
  createGroup,
  updateGroup,
  leaveGroup,
  inviteMember,
  updateMember,
  removeMember,
  listSharedReminders,
} from './family.controller.js';

const router = Router();

router.get('/group', getMyGroup);
router.post('/group', validateCreateGroup, createGroup);
router.put('/group', validateUpdateGroup, updateGroup);
router.post('/group/leave', leaveGroup);

router.post('/members', validateInviteMember, inviteMember);
router.put('/members/:id', validateMemberIdParam, validateUpdateMember, updateMember);
router.delete('/members/:id', validateMemberIdParam, removeMember);

// Must come after /group and /members - Express matches routes in
// registration order and none of these overlap with "/reminders" anyway,
// but keeping the static routes grouped together above is clearer.
router.get('/reminders', validateListSharedReminders, listSharedReminders);

export const familyRoutes = router;
