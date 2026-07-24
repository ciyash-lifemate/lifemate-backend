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
import * as callsService from './calls.service.js';

export const getCallHistory = asyncHandler(async (req, res) => {
  const calls = await callsService.listCallHistory(req.userId);
  sendSuccess(res, { data: calls });
});
