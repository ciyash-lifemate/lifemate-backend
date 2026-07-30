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

import * as contactsService from './contacts.service.js';

export const matchContacts = asyncHandler(async (req, res) => {
  const matches = await contactsService.matchContacts(req.userId, req.body.phones);
  sendSuccess(res, { data: matches });
});

export const sendNudge = asyncHandler(async (req, res) => {
  await contactsService.sendNudge(req.userId, req.params.userId);
  sendSuccess(res, { message: 'Nudge sent' });
});
