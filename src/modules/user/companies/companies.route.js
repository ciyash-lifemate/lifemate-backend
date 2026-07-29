import { Router } from 'express';
import { validateCreateCompany, validateUpdateCompany } from './companies.validation.js';
import { createCompany, getCompanies, getCompany, updateCompany, deleteCompany } from './companies.controller.js';

const router = Router();

router.get('/', getCompanies);
router.post('/', validateCreateCompany, createCompany);
router.get('/:id', getCompany);
router.put('/:id', validateUpdateCompany, updateCompany);
router.delete('/:id', deleteCompany);

export const companyRoutes = router;
