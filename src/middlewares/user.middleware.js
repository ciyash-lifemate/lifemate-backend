import { verifyUserAccessToken } from '../modules/user/user-auth/user.auth.service.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export const authenticateUser = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Authentication token missing'));
  }

  try {
    // Re-verified against the DB on every request (not just the JWT
    // signature) so a suspension takes effect immediately rather than
    // waiting for the token to expire.
    const user = await verifyUserAccessToken(token);
    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    next(err.name === 'ApiError' ? err : new ApiError(401, 'Invalid or expired token'));
  }
};
