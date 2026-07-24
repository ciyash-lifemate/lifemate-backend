import { validate } from '../../../middlewares/validate.middleware.js';
import { loginSchema } from './admin.auth.schema.js';

export const validateLogin = validate(loginSchema);
