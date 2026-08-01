import { Expo } from 'expo-server-sdk';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const expo = new Expo({ accessToken: env.expo.accessToken });

// Sends an Expo push notification to every device a user has registered
// (see modules/user/notifications for the register/unregister endpoints).
// Fire-and-forget from the caller's point of view - a push failure should
// never fail the request that triggered it (e.g. a reminder falling due).
// Which bundled Android channel to push through, per the user's
// notification_sound setting (see settings module) - must match a channel
// id the mobile app actually creates (src/utils/notifications.js). Falls
// back to the default channel for anything unrecognized, same as the
// column's own DB default. 'default'/'alert' keep their original v3 ids
// (channels are immutable once created on-device, so an already-installed
// app's existing channels must keep resolving the same way); every sound
// added after that lives under a new v4 prefix instead of touching those.
const V4_SOUND_IDS = ['bell', 'bells', 'pop', 'confirm', 'positive', 'doorbell', 'digital', 'magic', 'clear', 'urgent'];

// A sound picked from the user's own phone (see modules/reminder-sound)
// stores its own channel id directly as notification_sound - that channel
// was created on-device at pick time, so pushing through it just means
// passing this value straight through instead of looking it up.
const CUSTOM_CHANNEL_PREFIX = 'reminders-custom-';

const channelIdFor = (notificationSound) => {
  if (notificationSound === 'alert') return 'reminders-v3-alert';
  if (V4_SOUND_IDS.includes(notificationSound)) return `reminders-v4-${notificationSound}`;
  if (notificationSound?.startsWith(CUSTOM_CHANNEL_PREFIX)) return notificationSound;
  return 'reminders-v3-default';
};

export const sendExpoPush = async (userId, { title, body, data } = {}) => {
  const [rows] = await pool.query('SELECT expo_push_token FROM device_tokens WHERE user_id = ?', [
    userId,
  ]);

  const tokens = rows.map((r) => r.expo_push_token).filter((t) => Expo.isExpoPushToken(t));
  if (tokens.length === 0) return;

  const [settingsRows] = await pool.query('SELECT notification_sound FROM user_settings WHERE user_id = ?', [
    userId,
  ]);
  // channelId must match an Android channel the app actually created - a
  // mismatch (or omitting it) can route the notification through Android's
  // own default channel, which may have no sound configured.
  const channelId = channelIdFor(settingsRows[0]?.notification_sound);
  const messages = tokens.map((to) => ({ to, title, body, data, sound: 'default', channelId }));
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
