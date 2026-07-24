import { pool } from '../../../config/db.js';
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}
import { notifyNewMessage } from '../notifications/notifications.service.js';
import { emitToUser } from '../../../realtime/io.js';
import { isOnline } from '../../../realtime/presence.js';

// Only direct (1:1) chats are supported - every chat has exactly two participants.

const isParticipant = async (chatId, userId) => {
  const [rows] = await pool.query(
    'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?',
    [chatId, userId]
  );
  return rows.length > 0;
};

const assertParticipant = async (chatId, userId) => {
  if (!(await isParticipant(chatId, userId))) {
    throw new ApiError(404, 'Chat not found');
  }
};

// Both participants of a 1:1 chat, in one query.
const getParticipants = async (chatId) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.avatar_url FROM chat_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.chat_id = ?`,
    [chatId]
  );
  return rows;
};

const findOtherParticipant = async (chatId, userId) => {
  const participants = await getParticipants(chatId);
  return participants.find((p) => Number(p.id) !== Number(userId));
};

// Used by realtime/socket.js to know who to relay typing/call signaling to.
export const getOtherParticipant = findOtherParticipant;

const findMessageById = async (messageId) => {
  const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
  return rows[0];
};

export const startChat = async (userId, otherUserId) => {
  // String compare, not Number() - these ids can exceed Number.MAX_SAFE_INTEGER.
  if (String(otherUserId) === String(userId)) {
    throw new ApiError(400, 'Cannot start a chat with yourself');
  }

  const [existing] = await pool.query(
    `SELECT c.id FROM chats c
     JOIN chat_participants p1 ON p1.chat_id = c.id AND p1.user_id = ?
     JOIN chat_participants p2 ON p2.chat_id = c.id AND p2.user_id = ?
     LIMIT 1`,
    [userId, otherUserId]
  );

  if (existing[0]) return { chatId: existing[0].id };

  const [result] = await pool.query(
    'INSERT INTO chats (user_one_id, user_two_id) VALUES (?, ?)',
    [userId, otherUserId]
  );
  const chatId = result.insertId;
  await pool.query('INSERT INTO chat_participants (chat_id, user_id) VALUES (?, ?), (?, ?)', [
    chatId,
    userId,
    chatId,
    otherUserId,
  ]);
  return { chatId };
};

export const listMyChats = async (userId) => {
  const [rows] = await pool.query(
    `SELECT
      c.id AS chat_id,
      cp.is_pinned,
      ou.id AS other_user_id,
      ou.name AS other_user_name,
      ou.avatar_url AS other_user_avatar,
      ou.last_seen_at AS other_user_last_seen,
      (SELECT content FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
      (SELECT message_type FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_type,
      (SELECT created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM messages m
        WHERE m.chat_id = c.id AND m.sender_id != ? AND m.id > COALESCE(cp.last_read_message_id, 0)
      ) AS unread_count
     FROM chat_participants cp
     JOIN chats c ON c.id = cp.chat_id
     JOIN chat_participants ocp ON ocp.chat_id = c.id AND ocp.user_id != ?
     JOIN users ou ON ou.id = ocp.user_id
     WHERE cp.user_id = ?
     ORDER BY cp.is_pinned DESC, last_message_at DESC`,
    [userId, userId, userId]
  );
  return rows.map((row) => ({ ...row, other_user_online: isOnline(row.other_user_id) }));
};

export const listMessages = async (chatId, userId, { before, limit = 50 } = {}) => {
  await assertParticipant(chatId, userId);

  const params = [chatId];
  let cursor = '';
  if (before) {
    cursor = 'AND id < ?';
    params.push(before);
  }

  const [rows] = await pool.query(
    `SELECT * FROM messages WHERE chat_id = ? ${cursor} ORDER BY id DESC LIMIT ?`,
    [...params, Number(limit)]
  );
  return rows.reverse();
};

export const sendMessage = async (
  chatId,
  senderId,
  {
    content,
    messageType = 'text',
    mediaUrl,
    mediaName,
    mediaSize,
    mediaMime,
    mediaDuration,
    replyToId,
  }
) => {
  await assertParticipant(chatId, senderId);

  const recipient = await findOtherParticipant(chatId, senderId);
  // The recipient already has an open socket - the message is about to be
  // pushed to them in realtime, so it's delivered the moment it's sent.
  const initialStatus = recipient && isOnline(recipient.id) ? 'delivered' : 'sent';

  const [result] = await pool.query(
    `INSERT INTO messages
      (chat_id, sender_id, content, message_type, media_url, media_name, media_size, media_mime,
       media_duration, reply_to_id, status, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${initialStatus === 'delivered' ? 'CURRENT_TIMESTAMP' : 'NULL'})`,
    [
      chatId,
      senderId,
      content || null,
      messageType,
      mediaUrl || null,
      mediaName || null,
      mediaSize || null,
      mediaMime || null,
      mediaDuration || null,
      replyToId || null,
      initialStatus,
    ]
  );
  const message = await findMessageById(result.insertId);

  if (recipient) {
    emitToUser(recipient.id, 'message:new', message);
    emitToUser(senderId, 'message:status', {
      chatId,
      messageIds: [message.id],
      status: initialStatus,
    });

    const sender = await findOtherParticipant(chatId, recipient.id);
    const preview = message.content || `[${message.message_type}]`;
    await notifyNewMessage(recipient.id, {
      chatId,
      senderName: sender?.name || 'New message',
      preview: preview.slice(0, 140),
    });
  }

  return message;
};

export const markDelivered = async (chatId, userId) => {
  await assertParticipant(chatId, userId);

  const [result] = await pool.query(
    `UPDATE messages SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP
     WHERE chat_id = ? AND sender_id != ? AND status = 'sent'`,
    [chatId, userId]
  );
  if (result.affectedRows === 0) return;

  const sender = await findOtherParticipant(chatId, userId);
  if (sender) {
    emitToUser(sender.id, 'message:status', { chatId, status: 'delivered' });
  }
};

export const markRead = async (chatId, userId) => {
  await assertParticipant(chatId, userId);
  await pool.query(
    `UPDATE chat_participants
     SET last_read_message_id = (SELECT MAX(id) FROM messages WHERE chat_id = ?)
     WHERE chat_id = ? AND user_id = ?`,
    [chatId, chatId, userId]
  );

  const [result] = await pool.query(
    `UPDATE messages SET status = 'read', read_at = CURRENT_TIMESTAMP
     WHERE chat_id = ? AND sender_id != ? AND status != 'read'`,
    [chatId, userId]
  );
  if (result.affectedRows === 0) return;

  const sender = await findOtherParticipant(chatId, userId);
  if (sender) {
    emitToUser(sender.id, 'message:status', { chatId, status: 'read' });
  }
};

export const editMessage = async (chatId, messageId, userId, content) => {
  await assertParticipant(chatId, userId);
  const message = await findMessageById(messageId);
  if (!message || Number(message.chat_id) !== Number(chatId)) {
    throw new ApiError(404, 'Message not found');
  }
  if (Number(message.sender_id) !== Number(userId)) {
    throw new ApiError(403, 'You can only edit your own messages');
  }
  if (message.is_deleted) throw new ApiError(400, 'Cannot edit a deleted message');

  await pool.query('UPDATE messages SET content = ?, is_edited = TRUE WHERE id = ?', [
    content,
    messageId,
  ]);
  const updated = await findMessageById(messageId);

  const recipient = await findOtherParticipant(chatId, userId);
  if (recipient) emitToUser(recipient.id, 'message:edited', updated);
  return updated;
};

export const deleteMessage = async (chatId, messageId, userId) => {
  await assertParticipant(chatId, userId);
  const message = await findMessageById(messageId);
  if (!message || Number(message.chat_id) !== Number(chatId)) {
    throw new ApiError(404, 'Message not found');
  }
  if (Number(message.sender_id) !== Number(userId)) {
    throw new ApiError(403, 'You can only delete your own messages');
  }

  await pool.query(
    `UPDATE messages SET is_deleted = TRUE, content = NULL,
      media_url = NULL, media_name = NULL, media_size = NULL, media_mime = NULL, media_duration = NULL
     WHERE id = ?`,
    [messageId]
  );

  const recipient = await findOtherParticipant(chatId, userId);
  if (recipient) emitToUser(recipient.id, 'message:deleted', { chatId, messageId: Number(messageId) });
};

export const setPinned = async (chatId, userId, isPinned) => {
  await assertParticipant(chatId, userId);
  await pool.query('UPDATE chat_participants SET is_pinned = ? WHERE chat_id = ? AND user_id = ?', [
    isPinned,
    chatId,
    userId,
  ]);
};
