import { Router } from 'express';
import { authenticateUser } from '../../../middlewares/user.middleware.js';
import {
  validateSendOtp,
  validateVerifyOtp,
  validateGoogleLogin,
  validateUpdateProfile,
  validateSearchUsers,
} from './user.auth.validation.js';
import {
  sendOtp,
  verifyOtp,
  googleLogin,
  getMe,
  updateMe,
  searchUsersHandler,
} from './user.auth.controller.js';

const router = Router();

// --- auth ---
router.post('/otp/send', validateSendOtp, sendOtp);
router.post('/otp/verify', validateVerifyOtp, verifyOtp);
router.post('/google', validateGoogleLogin, googleLogin);

// --- profile (folded into user-auth rather than a separate module) ---
router.get('/me', authenticateUser, getMe);
router.put('/me', authenticateUser, validateUpdateProfile, updateMe);
router.get('/search', authenticateUser, validateSearchUsers, searchUsersHandler);

export const userAuthRoutes = router;
