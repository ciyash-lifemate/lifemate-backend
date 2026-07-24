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
import { loginAdmin } from './admin.auth.service.js';

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { token, admin } = await loginAdmin(email, password);
  sendSuccess(res, { message: 'Login successful', data: { token, admin } });
});

export const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: req.admin });
});
