import { Router } from 'express';
import { validateUpdateBusinessCard } from './business-card.validation.js';
import { getBusinessCard, updateBusinessCard } from './business-card.controller.js';

const router = Router();

router.get('/', getBusinessCard);
router.put('/', validateUpdateBusinessCard, updateBusinessCard);

export const businessCardRoutes = router;
