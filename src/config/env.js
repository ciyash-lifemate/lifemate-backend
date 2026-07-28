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

  expo: {
    // Only needed if "Enhanced Security for Push Notifications" is enabled
    // on the Expo account - undefined is a valid, working config otherwise.
    accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  },
};
   