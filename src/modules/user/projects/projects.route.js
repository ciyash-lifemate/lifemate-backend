import { Router } from 'express';
import { validateCreateProject, validateUpdateProject, validateListProjects } from './projects.validation.js';
import { createProject, getProjects, getProject, updateProject, deleteProject } from './projects.controller.js';

const router = Router();

router.get('/', validateListProjects, getProjects);
router.post('/', validateCreateProject, createProject);
router.get('/:id', getProject);
router.put('/:id', validateUpdateProject, updateProject);
router.delete('/:id', deleteProject);

export const projectRoutes = router;
