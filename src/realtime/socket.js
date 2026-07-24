import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { findUserById, verifyUserAccessToken } from '../modules/user/user-auth/user.auth.service.js';
import * as chatsService from '../modules/user/chats/chats.service.js';
import * as callsService from '../modules/user/calls/calls.service.js';
import { notifyIncomingCall } from '../modules/user/notifications/notifications.service.js';
import { setIo, emitToUser } from './io.js';
import { addSocket, removeSocket, isOnline } from './presence.js';

// Every user this person shares a 1:1 chat with - used to fan out
// online/offline presence updates without broadcasting to every socket.
const getChatPartnerIds = async (userId) => {
  const [rows] = await pool.query(
    `SELECT DISTINCT cp2.user_id AS partner_id
     FROM chat_participants cp1
     JOIN chat_participants cp2 ON cp2.chat_id = cp1.chat_id AND cp2.user_id != cp1.user_id
     WHERE cp1.user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.partner_id);
};

const broadcastPresence = async (userId, status) => {
  const partnerIds = await getChatPartnerIds(userId);
  partnerIds.forEach((partnerId) => emitToUser(partnerId, 'presence:update', { userId, status }));
};

// Wraps a socket event handler so a thrown/rejected error is logged instead
// of crashing the process or silently vanishing.
const safe = (socket, handler) => async (...args) => {
  try {
    await handler(...args);
  } catch (err) {
    const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    logger.error('Socket handler error', { message: err.message, userId: socket.userId });
    ack?.({ success: false, error: err.message });
  }
};

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.socket.corsOrigin },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication token missing'));

    try {
      // Same check the REST routes run in middlewares/user.middleware.js -
      // verifies the JWT and re-checks is_active against the DB.
      const user = await verifyUserAccessToken(token);
      socket.userId = user.id;
      next();
    } catch (err) {
      next(new Error(err.name === 'ApiError' ? err.message : 'Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);

    const isFirstConnection = addSocket(userId, socket.id);
    if (isFirstConnection) broadcastPresence(userId, 'online');

    // --- typing indicator ---
    socket.on(
      'typing:start',
      safe(socket, async ({ chatId }) => {
        const other = await chatsService.getOtherParticipant(chatId, userId);
        if (other) emitToUser(other.id, 'typing:start', { chatId, userId });
      })
    );
    socket.on(
      'typing:stop',
      safe(socket, async ({ chatId }) => {
        const other = await chatsService.getOtherParticipant(chatId, userId);
        if (other) emitToUser(other.id, 'typing:stop', { chatId, userId });
      })
    );

    // --- messages (text/image/video/audio/voice/document) ---
    // chatsService.sendMessage emits 'message:new' / 'message:status' itself,
    // so both this socket path and the REST fallback stay in sync.
    socket.on(
      'message:send',
      safe(socket, async (payload, ack) => {
        const message = await chatsService.sendMessage(payload.chatId, userId, payload);
        ack?.({ success: true, tempId: payload.tempId, message });
      })
    );

    socket.on(
      'message:delivered',
      safe(socket, async ({ chatId }) => {
        await chatsService.markDelivered(chatId, userId);
      })
    );

    socket.on(
      'message:read',
      safe(socket, async ({ chatId }) => {
        await chatsService.markRead(chatId, userId);
      })
    );

    socket.on(
      'message:edit',
      safe(socket, async ({ chatId, messageId, content }, ack) => {
        const message = await chatsService.editMessage(chatId, messageId, userId, content);
        ack?.({ success: true, message });
      })
    );

    socket.on(
      'message:delete',
      safe(socket, async ({ chatId, messageId }, ack) => {
        await chatsService.deleteMessage(chatId, messageId, userId);
        ack?.({ success: true });
      })
    );

    // --- WebRTC signaling relay (audio/video calls) ---
    // Socket.IO only ever carries the SDP offer/answer and ICE candidates;
    // the actual audio/video stream flows peer-to-peer over WebRTC.
    socket.on(
      'call:invite',
      safe(socket, async ({ chatId, toUserId, callType, offer }, ack) => {
        const call = await callsService.startCall(chatId, userId, toUserId, callType);
        emitToUser(toUserId, 'call:invite', { callId: call.id, chatId, callType, offer, from: userId });

        if (!isOnline(toUserId)) {
          const caller = await findUserById(userId);
          await notifyIncomingCall(toUserId, { chatId, callerName: caller?.name || 'LifeMate', callType });
        }
        ack?.({ success: true, callId: call.id });
      })
    );

    socket.on(
      'call:answer',
      safe(socket, async ({ callId, toUserId, answer }) => {
        await callsService.answerCall(callId);
        emitToUser(toUserId, 'call:answer', { callId, answer, from: userId });
      })
    );

    socket.on('call:ice-candidate', ({ callId, toUserId, candidate }) => {
      emitToUser(toUserId, 'call:ice-candidate', { callId, candidate, from: userId });
    });

    socket.on(
      'call:reject',
      safe(socket, async ({ callId, toUserId }) => {
        await callsService.endCall(callId, { rejected: true });
        emitToUser(toUserId, 'call:reject', { callId, from: userId });
      })
    );

    socket.on(
      'call:end',
      safe(socket, async ({ callId, toUserId }) => {
        await callsService.endCall(callId);
        emitToUser(toUserId, 'call:end', { callId, from: userId });
      })
    );

    socket.on(
      'disconnect',
      safe(socket, async () => {
        const wasLastConnection = removeSocket(userId, socket.id);
        if (wasLastConnection) {
          await pool.query('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
          await broadcastPresence(userId, 'offline');
        }
      })
    );
  });

  setIo(io);
  return io;
};
