const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, { statusCode = 200, message, data } = {}) => {
  res.status(statusCode).json({
    success: true,
    ...(message !== undefined && { message }),
    ...(data !== undefined && { data }),
  });
};
import * as notesService from './notes.service.js';

export const createNote = asyncHandler(async (req, res) => {
  const note = await notesService.createNote(req.userId, req.body);
  sendSuccess(res, { statusCode: 201, data: note });
});

export const getNotes = asyncHandler(async (req, res) => {
  const notes = await notesService.listNotes(req.userId, req.query);
  sendSuccess(res, { data: notes });
});

export const getNote = asyncHandler(async (req, res) => {
  const note = await notesService.getNote(req.params.id, req.userId);
  sendSuccess(res, { data: note });
});

export const updateNote = asyncHandler(async (req, res) => {
  const note = await notesService.updateNote(req.params.id, req.userId, req.body);
  sendSuccess(res, { data: note });
});

export const deleteNote = asyncHandler(async (req, res) => {
  await notesService.deleteNote(req.params.id, req.userId);
  sendSuccess(res, { message: 'Note deleted' });
});
