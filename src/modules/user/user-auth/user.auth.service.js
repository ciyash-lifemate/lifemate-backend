import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../../../config/db.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

const SAFE_FIELDS = `id, name, email, mobile, avatar_url, date_of_birth, language,
  is_profile_complete, is_active, created_at`;

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const signUserToken = (payload) => jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

const OTP_DIGITS = '0123456789';
const generateOtp = (length = 6) => {
  let otp = '';
  for (let i = 0; i < length; i += 1) {
    otp += OTP_DIGITS[crypto.randomInt(0, OTP_DIGITS.length)];
  }
  return otp;
};

// --- SMS delivery ---
// No SMS provider is configured yet. This is the single place to plug one in
// (Twilio, MSG91, Fast2SMS, AWS SNS, ...) once those API keys are available -
// everything else only calls sendOtpSms() and never talks to a provider directly.
const sendOtpSms = async (mobile, otp) => {
  logger.info(`[otp] code for ${mobile}: ${otp}`);
  // TODO: replace with a real provider call, e.g.:
  // await twilioClient.messages.create({ to: mobile, from: env.sms.from, body: `Your LifeMate AI code is ${otp}` });
};

// --- Google ID token verification ---
let googleClient;
const getGoogleClient = () => {
  if (!env.google.clientId) throw new ApiError(500, 'GOOGLE_CLIENT_ID is not configured');
  if (!googleClient) googleClient = new OAuth2Client(env.google.clientId);
  return googleClient;
};

const verifyGoogleIdToken = async (idToken) => {
  const ticket = await getGoogleClient()
    .verifyIdToken({ idToken, audience: env.google.clientId })
    .catch(() => {
      throw new ApiError(401, 'Invalid Google token');
    });

  const payload = ticket.getPayload();
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    avatarUrl: payload.picture,
  };
};

const issueSession = (user) => ({ token: signUserToken({ userId: user.id }), user });

// --- users ---

export const findUserById = async (id) => {
  const [rows] = await pool.query(`SELECT ${SAFE_FIELDS} FROM users WHERE id = ?`, [id]);
  return rows[0];
};

export const verifyUserAccessToken = async (token) => {
  const payload = jwt.verify(token, env.jwt.secret); // throws on invalid/expired
  const user = await findUserById(payload.userId);
  if (!user) throw new ApiError(401, 'User no longer exists');
  if (!user.is_active) throw new ApiError(403, 'Account suspended');
  return user;
};

const findUserByMobile = async (mobile) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE mobile = ?', [mobile]);
  return rows[0];
};

const findUserByGoogleId = async (googleId) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
  return rows[0];
};

const findUserByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

const createUserWithMobile = async (mobile) => {
  const [result] = await pool.query('INSERT INTO users (mobile) VALUES (?)', [mobile]);
  return findUserById(result.insertId);
};

const createUserWithGoogle = async ({ googleId, email, name, avatarUrl }) => {
  const [result] = await pool.query(
    'INSERT INTO users (google_id, email, name, avatar_url) VALUES (?, ?, ?, ?)',
    [googleId, email, name, avatarUrl]
  );
  return findUserById(result.insertId);
};

// --- Auth: mobile OTP ---

export const requestMobileOtp = async (mobile) => {
  const otpCode = generateOtp(env.otp.length);
  const expiresAt = new Date(Date.now() + env.otp.expiryMinutes * 60 * 1000);

  await pool.query('INSERT INTO otp_verifications (mobile, otp_code, expires_at) VALUES (?, ?, ?)', [
    mobile,
    otpCode,
    expiresAt,
  ]);
  await sendOtpSms(mobile, otpCode);

  return {
    mobile,
    expiresInMinutes: env.otp.expiryMinutes,
    // Only present until a real SMS provider is wired into sendOtpSms above.
    ...(env.otp.debugExposeOtp ? { debugOtp: otpCode } : {}),
  };
};

export const verifyMobileOtp = async (mobile, otpCode) => {
  const [otpRows] = await pool.query(
    `SELECT * FROM otp_verifications
     WHERE mobile = ? AND is_verified = FALSE
     ORDER BY id DESC LIMIT 1`,
    [mobile]
  );
  const otp = otpRows[0];
  if (!otp) throw new ApiError(400, 'No OTP was requested for this number');

  if (otp.attempts >= env.otp.maxAttempts) {
    throw new ApiError(429, 'Too many attempts. Request a new OTP');
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    throw new ApiError(400, 'OTP has expired');
  }
  if (otp.otp_code !== otpCode) {
    await pool.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
    throw new ApiError(400, 'Incorrect OTP');
  }

  await pool.query('UPDATE otp_verifications SET is_verified = TRUE WHERE id = ?', [otp.id]);

  let user = await findUserByMobile(mobile);
  if (!user) user = await createUserWithMobile(mobile);
  if (!user.is_active) throw new ApiError(403, 'Account suspended');

  return issueSession(await findUserById(user.id));
};

// --- Auth: Google ---

export const loginWithGoogle = async (idToken) => {
  const { googleId, email, name, avatarUrl } = await verifyGoogleIdToken(idToken);

  let user = await findUserByGoogleId(googleId);
  if (!user && email) user = await findUserByEmail(email);
  if (!user) user = await createUserWithGoogle({ googleId, email, name, avatarUrl });
  if (!user.is_active) throw new ApiError(403, 'Account suspended');

  return issueSession(await findUserById(user.id));
};

// --- Profile ---

export const getMyProfile = async (userId) => {
  const user = await findUserById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

export const updateMyProfile = async (userId, { name, email, dateOfBirth, language, avatarUrl }) => {
  await pool.query(
    `UPDATE users SET
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      date_of_birth = COALESCE(?, date_of_birth),
      language = COALESCE(?, language),
      avatar_url = COALESCE(?, avatar_url),
      is_profile_complete = TRUE
     WHERE id = ?`,
    [name, email, dateOfBirth, language, avatarUrl, userId]
  );
  return findUserById(userId);
};

export const searchUsers = async (query, currentUserId) => {
  const trimmed = query.trim();
  const [rows] = await pool.query(
    `SELECT id, name, avatar_url FROM users
     WHERE (name LIKE ? OR mobile LIKE ?) AND id != ? LIMIT 20`,
    [`%${trimmed}%`, `%${trimmed}%`, currentUserId]
  );
  return rows;
};

// --- admin-facing (still used by the flat admin/users management routes) ---

export const findAllUsersPaged = async ({ page = 1, pageSize = 20, search }) => {
  const offset = (page - 1) * pageSize;
  const params = [];
  let where = '';
  if (search) {
    where = 'WHERE name LIKE ? OR email LIKE ? OR mobile LIKE ?';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const [rows] = await pool.query(
    `SELECT ${SAFE_FIELDS} FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);

  return { rows, total, page, pageSize };
};

export const setUserActive = async (id, isActive) => {
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive, id]);
  return findUserById(id);
};

export const deleteUserById = async (id) => {
  const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows > 0;
};

const ALLOWED_COUNT_TABLES = ['users', 'reminders', 'notes'];
export const countTable = async (table) => {
  if (!ALLOWED_COUNT_TABLES.includes(table)) throw new Error(`countTable: unsupported table "${table}"`);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ${table}`);
  return total;
};
