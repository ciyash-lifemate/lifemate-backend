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

import * as fitnessService from './fitness.service.js';

export const getFitnessLog = asyncHandler(async (req, res) => {
  const log = await fitnessService.getFitnessLog(req.userId, req.params.date);
  sendSuccess(res, { data: log });
});

export const upsertFitnessLog = asyncHandler(async (req, res) => {
  const log = await fitnessService.upsertFitnessLog(req.userId, req.params.date, req.body);
  sendSuccess(res, { message: 'Fitness data saved', data: log });
});

export const listFitnessDates = asyncHandler(async (req, res) => {
  const dates = await fitnessService.listFitnessDates(req.userId, req.query.from, req.query.to);
  sendSuccess(res, { data: dates });
});
