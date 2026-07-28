import { Expo } from 'expo-server-sdk';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const expo = new Expo({ accessToken: env.expo.accessToken });

// Sends an Expo push notification to every device a user has registered
// (see modules/user/notifications for the register/unregister endpoints).
// Fire-and-forget from the caller's point of view - a push failure should
// never fail the request that triggered it (e.g. a reminder falling due).
export const sendExpoPush = async (userId, { title, body, data } = {}) => {
  const [rows] = await pool.query('SELECT expo_push_token FROM device_tokens WHERE user_id = ?', [
    userId,
  ]);

  const tokens = rows.map((r) => r.expo_push_token).filter((t) => Expo.isExpoPushToken(t));
  if (tokens.length === 0) return;

  // channelId must match the Android channel the app actually created
  // (src/utils/notifications.js) - a mismatch (or omitting it) can route the
  // notification through Android's own default channel, which may have no
  // sound configured.
  const messages = tokens.map((to) => ({ to, title, body, data, sound: 'default', channelId: 'reminders-v2' }));
  const chunks = expo.chunkPushNotifications(messages);
  const staleTokens = [];

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      receipts.forEach((receipt, i) => {
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          staleTokens.push(chunk[i].to);
        }
      });
    } catch (err) {
      logger.error('Expo push send failed', { message: err.message, userId });
    }
  }

  if (staleTokens.length > 0) {
    await pool.query('DELETE FROM device_tokens WHERE expo_push_token IN (?)', [staleTokens]);
  }
};
