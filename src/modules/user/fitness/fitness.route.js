import { Router } from 'express';
import {
  validateFitnessDateParam,
  validateUpsertFitnessLog,
  validateListFitnessDates,
} from './fitness.validation.js';
import { getFitnessLog, upsertFitnessLog, listFitnessDates } from './fitness.controller.js';

const router = Router();

// Must come before /:date - otherwise Express would match "dates" as a date
// param and validateFitnessDateParam would reject it.
router.get('/dates', validateListFitnessDates, listFitnessDates);
router.get('/:date', validateFitnessDateParam, getFitnessLog);
router.put('/:date', validateFitnessDateParam, validateUpsertFitnessLog, upsertFitnessLog);

export const fitnessRoutes = router;
