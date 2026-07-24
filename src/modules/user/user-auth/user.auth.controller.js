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
import * as userAuthService from './user.auth.service.js';

export const sendOtp = asyncHandler(async (req, res) => {
  const result = await userAuthService.requestMobileOtp(req.body.mobile);
  sendSuccess(res, { message: 'OTP sent', data: result });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { mobile, otp } = req.body;
  const { token, user } = await userAuthService.verifyMobileOtp(mobile, otp);
  sendSuccess(res, { message: 'Login successful', data: { token, user } });
});

export const googleLogin = asyncHandler(async (req, res) => {
  const { token, user } = await userAuthService.loginWithGoogle(req.body.idToken);
  sendSuccess(res, { message: 'Login successful', data: { token, user } });
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await userAuthService.getMyProfile(req.userId);
  sendSuccess(res, { data: user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await userAuthService.updateMyProfile(req.userId, req.body);
  sendSuccess(res, { data: user });
});

export const searchUsersHandler = asyncHandler(async (req, res) => {
  const users = await userAuthService.searchUsers(req.query.q, req.userId);
  sendSuccess(res, { data: users });
});
