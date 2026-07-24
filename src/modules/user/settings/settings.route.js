import { Router } from 'express';
import { validateUpdateSettings } from './settings.validation.js';
import { getSettings, updateSettings } from './settings.controller.js';

const router = Router();

router.get('/', getSettings);
router.put('/', validateUpdateSettings, updateSettings);

export const settingsRoutes = router;
