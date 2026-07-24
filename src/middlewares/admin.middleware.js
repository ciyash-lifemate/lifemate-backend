import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findAdminById } from '../modules/admin/admin-auth/admin.auth.model.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const verifyAdminToken = (token) => jwt.verify(token, env.admin.jwtSecret);

// Fully independent from authenticateUser: separate secret (ADMIN_JWT_SECRET)
// and a separate admins table, so a user token can never pass as an admin one.
export const authenticateAdmin = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Admin authentication token missing'));
  }

  try {
    const payload = verifyAdminToken(token);
    const admin = await findAdminById(payload.adminId);

    if (!admin) return next(new ApiError(401, 'Admin no longer exists'));

    req.admin = admin;
    req.adminId = admin.id;
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired admin token'));
  }
};
