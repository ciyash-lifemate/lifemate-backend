import { Router } from 'express';
import { validateListUsers, validateSetActive } from './admin.users.validation.js';
import { getUsers, getUser, setUserActive, deleteUser } from './admin.users.controller.js';

const router = Router();

router.get('/', validateListUsers, getUsers);
router.get('/:id', getUser);
router.patch('/:id/active', validateSetActive, setUserActive);
router.delete('/:id', deleteUser);

export const adminUsersRoutes = router;
