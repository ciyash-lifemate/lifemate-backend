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
import { getStats } from './admin.stats.service.js';

export const getAdminStats = asyncHandler(async (req, res) => {
  const stats = await getStats();
  sendSuccess(res, { data: stats });
});
