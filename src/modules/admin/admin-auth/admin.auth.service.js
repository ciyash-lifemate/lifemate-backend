import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { findAdminByEmail, findAdminById } from './admin.auth.model.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const signAdminToken = (payload) =>
  jwt.sign(payload, env.admin.jwtSecret, { expiresIn: env.admin.jwtExpiresIn });

export const loginAdmin = async (email, password) => {
  const admin = await findAdminByEmail(email);
  if (!admin) throw new ApiError(401, 'Invalid email or password');

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatches) throw new ApiError(401, 'Invalid email or password');

  const token = signAdminToken({ adminId: admin.id });
  return { token, admin: await findAdminById(admin.id) };
};
