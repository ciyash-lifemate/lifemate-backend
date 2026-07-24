import { validate } from '../../../middlewares/validate.middleware.js';
import {
  sendOtpSchema,
  verifyOtpSchema,
  googleLoginSchema,
  updateProfileSchema,
  searchUsersSchema,
} from './user.auth.schema.js';

export const validateSendOtp = validate(sendOtpSchema);
export const validateVerifyOtp = validate(verifyOtpSchema);
export const validateGoogleLogin = validate(googleLoginSchema);
export const validateUpdateProfile = validate(updateProfileSchema);
export const validateSearchUsers = validate(searchUsersSchema, 'query');
