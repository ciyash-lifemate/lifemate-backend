import { Router } from 'express';
import { validateCreateNote, validateUpdateNote, validateListNotes } from './notes.validation.js';
import { createNote, getNotes, getNote, updateNote, deleteNote } from './notes.controller.js';

const router = Router();

router.get('/', validateListNotes, getNotes);
router.post('/', validateCreateNote, createNote);
router.get('/:id', getNote);
router.put('/:id', validateUpdateNote, updateNote);
router.delete('/:id', deleteNote);

export const noteRoutes = router;
