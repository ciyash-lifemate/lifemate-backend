import { Router } from 'express';
import { validateMatchContacts, validateNudgeParam } from './contacts.validation.js';
import { matchContacts, sendNudge } from './contacts.controller.js';

const router = Router();

router.post('/match', validateMatchContacts, matchContacts);
router.post('/:userId/nudge', validateNudgeParam, sendNudge);

export const contactsRoutes = router;
