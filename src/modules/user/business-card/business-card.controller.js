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

import * as businessCardService from './business-card.service.js';

export const getBusinessCard = asyncHandler(async (req, res) => {
  const card = await businessCardService.getBusinessCard(req.userId);
  sendSuccess(res, { data: card });
});

export const updateBusinessCard = asyncHandler(async (req, res) => {
  const card = await businessCardService.updateBusinessCard(req.userId, req.body);
  sendSuccess(res, { message: 'Business card saved', data: card });
});
