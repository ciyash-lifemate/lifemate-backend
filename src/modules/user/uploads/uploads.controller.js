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
import { describeUploadedFile } from './uploads.service.js';

export const uploadFile = asyncHandler(async (req, res) => {
  const file = describeUploadedFile(req.file);
  sendSuccess(res, { statusCode: 201, data: file });
});
