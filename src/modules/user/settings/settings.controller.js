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
import * as settingsService from './settings.service.js';

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings(req.userId);
  sendSuccess(res, { data: settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.userId, req.body);
  sendSuccess(res, { data: settings });
});
