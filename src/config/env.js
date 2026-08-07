import 'dotenv/config';

const required = (name) => {
  const value = process.env[name];
  if (value === undefined || value === '') throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT) || 4000,
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
    sslCaPath: process.env.DB_SSL_CA_PATH || undefined,
  },

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  },

  admin: {
    jwtSecret: required('ADMIN_JWT_SECRET'),
    jwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '7d',
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },

  otp: {
    length: Number(process.env.OTP_LENGTH) || 6,
    expiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES) || 5,
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS) || 5,
    debugExposeOtp: process.env.DEBUG_OTP === 'true',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSizeMb: Number(process.env.UPLOAD_MAX_MB) || 50,
    // Optional. Empty means "return a relative /uploads/... path and let the
    // client resolve it against the API origin it already uses" - which is
    // what a phone needs, since a hardcoded localhost/LAN IP breaks the moment
    // the app runs anywhere but this machine. Set it only when media lives on
    // a different origin than the API (a CDN or object store).
    publicBaseUrl: process.env.UPLOAD_PUBLIC_BASE_URL || '',
  },

  socket: {
    // Comma-separated list, e.g. "https://app.example.com,exp://192.168.1.5:8081".
    // Left as "*" (Socket.IO's own default) for local/Expo Go development.
    corsOrigin: process.env.SOCKET_CORS_ORIGIN ? process.env.SOCKET_CORS_ORIGIN.split(',') : '*',
  },

  chat: {
    // Base64-encoded 32 bytes, for AES-256-GCM of message content at rest.
    // Empty is allowed and means "store plaintext" (utils/messageCrypto.js
    // warns at boot) so a dev instance without the key still runs.
    encryptionKey: process.env.CHAT_ENCRYPTION_KEY || '',
  },

  expo: {
    // Only needed if "Enhanced Security for Push Notifications" is enabled
    // on the Expo account - undefined is a valid, working config otherwise.
    accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  },

  gemini: {
    // Not required(): an empty key is a valid config that makes ai-chat fall
    // back to the rule-based parser instead of taking the whole server down.
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
  },
};
   