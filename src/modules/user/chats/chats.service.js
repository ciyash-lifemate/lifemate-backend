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
import { encryptMessage, decryptMessage, decryptRow } from '../../../utils/messageCrypto.js';

// Only direct (1:1) chats are supported - every chat has exactly two
// participants. Note that ids are BIGINT AUTO_RANDOM and mysql2 runs with
// bigNumberStrings, so every id compared in JS is compared as a string:
// Number() silently rounds these past 2^53 and would make two distinct
// messages look like the same one.
const sameId = (a, b) => String(a) === String(b);

// Everything below orders and compares by created_at, never by id. Message ids
// are TiDB AUTO_RANDOM: the high bits are random shard bits, so a row inserted
// later frequently gets a SMALLER id than one inserted before it. "ORDER BY id"
// hands back messages in arbitrary order, and "id > last_read" marks the wrong
// ones read. created_at is TIMESTAMP(6), so two messages in the same second
// still order deterministically (see scripts/migrate.mjs).
const ORDER_NEWEST_FIRST = 'ORDER BY m.created_at DESC, m.id DESC';

// A message is hidden from a participant if they cleared the chat past it, or
// deleted that one message "for me". Both are per-participant, so this has to
// be applied on every read path rather than baked into the rows.
const VISIBLE_TO = `
  (cp.cleared_before_at IS NULL OR m.created_at > cp.cleared_before_at)
  AND NOT EXISTS (
    SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = cp.user_id
  )
`;

const isParticipant = async (chatId, userId) => {
  const [rows] = await pool.query(
    'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?',
    [chatId, userId]
  );
  return rows.length > 0;
};

const assertParticipant = async (chatId, userId) => {
  // 404 rather than 403 - a non-participant shouldn't learn that the chat
  // exists at all.
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
  return participants.find((p) => !sameId(p.id, userId));
};

// Used by realtime/socket.js to know who to relay typing indicators to.
export const getOtherParticipant = findOtherParticipant;

const findMessageById = async (messageId) => {
  const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
  return rows[0];
};

export const startChat = async (userId, otherUserId) => {
  if (sameId(otherUserId, userId)) {
    throw new ApiError(400, 'Cannot start a chat with yourself');
  }

  const [userRows] = await pool.query('SELECT id FROM users WHERE id = ? AND is_active = TRUE', [
    otherUserId,
  ]);
  if (!userRows[0]) throw new ApiError(404, 'User not found');

  const [existing] = await pool.query(
    `SELECT c.id FROM chats c
     JOIN chat_participants p1 ON p1.chat_id = c.id AND p1.user_id = ?
     JOIN chat_participants p2 ON p2.chat_id = c.id AND p2.user_id = ?
     WHERE c.is_group = FALSE
     LIMIT 1`,
    [userId, otherUserId]
  );

  if (existing[0]) return { chatId: existing[0].id };

  // chat_participants is the source of truth for membership (it's what group
  // chat will use). user_one_id/user_two_id are the original schema's columns,
  // still populated for direct chats so older databases - where they're NOT
  // NULL - keep accepting the insert. See scripts/migrate.mjs.
  const [result] = await pool.query(
    'INSERT INTO chats (is_group, user_one_id, user_two_id) VALUES (FALSE, ?, ?)',
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
      (SELECT m.content FROM messages m
        WHERE m.chat_id = c.id AND ${VISIBLE_TO} ${ORDER_NEWEST_FIRST} LIMIT 1) AS last_message,
      (SELECT m.message_type FROM messages m
        WHERE m.chat_id = c.id AND ${VISIBLE_TO} ${ORDER_NEWEST_FIRST} LIMIT 1) AS last_message_type,
      (SELECT m.is_deleted FROM messages m
        WHERE m.chat_id = c.id AND ${VISIBLE_TO} ${ORDER_NEWEST_FIRST} LIMIT 1) AS last_message_deleted,
      (SELECT m.created_at FROM messages m
        WHERE m.chat_id = c.id AND ${VISIBLE_TO} ${ORDER_NEWEST_FIRST} LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM messages m
        WHERE m.chat_id = c.id AND m.sender_id != cp.user_id
          AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at) AND ${VISIBLE_TO}
      ) AS unread_count
     FROM chat_participants cp
     JOIN chats c ON c.id = cp.chat_id
     JOIN chat_participants ocp ON ocp.chat_id = c.id AND ocp.user_id != cp.user_id
     JOIN users ou ON ou.id = ocp.user_id
     WHERE cp.user_id = ?
     ORDER BY cp.is_pinned DESC, last_message_at DESC`,
    [userId]
  );

  return rows.map((row) => ({
    ...row,
    last_message: row.last_message_deleted ? null : decryptMessage(row.last_message),
    other_user_online: isOnline(row.other_user_id),
  }));
};

export const listMessages = async (chatId, userId, { before, limit = 50 } = {}) => {
  await assertParticipant(chatId, userId);

  // `before` is the created_at of the oldest message already on screen, not an
  // id - see the note on ORDER_NEWEST_FIRST for why an id cursor can't work.
  const cursor = before ? 'AND m.created_at < ?' : '';
  const cursorParams = before ? [before] : [];

  const [rows] = await pool.query(
    `SELECT m.* FROM messages m
     JOIN chat_participants cp ON cp.chat_id = m.chat_id AND cp.user_id = ?
     WHERE m.chat_id = ? ${cursor} AND ${VISIBLE_TO}
     ${ORDER_NEWEST_FIRST} LIMIT ?`,
    [userId, chatId, ...cursorParams, Number(limit)]
  );
  return rows.reverse().map(decryptRow);
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
      encryptMessage(content),
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
  // Decrypted before it leaves this function: everything downstream (the HTTP
  // response, the socket payload, the push preview) wants the plaintext.
  const message = decryptRow(await findMessageById(result.insertId));

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
  // "Everything up to now is read". MAX(id) would be meaningless here - these
  // ids aren't ordered by insertion time (see ORDER_NEWEST_FIRST above).
  await pool.query(
    `UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP(6)
     WHERE chat_id = ? AND user_id = ?`,
    [chatId, userId]
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
  if (!message || !sameId(message.chat_id, chatId)) {
    throw new ApiError(404, 'Message not found');
  }
  if (!sameId(message.sender_id, userId)) {
    throw new ApiError(403, 'You can only edit your own messages');
  }
  if (message.is_deleted) throw new ApiError(400, 'Cannot edit a deleted message');

  await pool.query('UPDATE messages SET content = ?, is_edited = TRUE WHERE id = ?', [
    encryptMessage(content),
    messageId,
  ]);
  const updated = decryptRow(await findMessageById(messageId));

  const recipient = await findOtherParticipant(chatId, userId);
  if (recipient) emitToUser(recipient.id, 'message:edited', updated);
  return updated;
};

/**
 * Two different deletes:
 *   forEveryone - clears the row's content for both sides (sender only).
 *   otherwise   - a message_deletions row that hides it for this user alone,
 *                 leaving the other participant's copy untouched.
 */
export const deleteMessage = async (chatId, messageId, userId, { forEveryone = true } = {}) => {
  await assertParticipant(chatId, userId);
  const message = await findMessageById(messageId);
  if (!message || !sameId(message.chat_id, chatId)) {
    throw new ApiError(404, 'Message not found');
  }

  if (!forEveryone) {
    await pool.query(
      'INSERT IGNORE INTO message_deletions (message_id, user_id) VALUES (?, ?)',
      [messageId, userId]
    );
    return;
  }

  if (!sameId(message.sender_id, userId)) {
    throw new ApiError(403, 'You can only delete your own messages for everyone');
  }

  await pool.query(
    `UPDATE messages SET is_deleted = TRUE, content = NULL,
      media_url = NULL, media_name = NULL, media_size = NULL, media_mime = NULL, media_duration = NULL
     WHERE id = ?`,
    [messageId]
  );

  const recipient = await findOtherParticipant(chatId, userId);
  if (recipient) emitToUser(recipient.id, 'message:deleted', { chatId, messageId: String(messageId) });
};

// "Clear chat" - hides everything currently in the chat for this participant
// only. The rows stay put so the other side still sees the full history.
export const clearChat = async (chatId, userId) => {
  await assertParticipant(chatId, userId);
  await pool.query(
    `UPDATE chat_participants SET cleared_before_at = CURRENT_TIMESTAMP(6)
     WHERE chat_id = ? AND user_id = ?`,
    [chatId, userId]
  );
};

export const setPinned = async (chatId, userId, isPinned) => {
  await assertParticipant(chatId, userId);
  await pool.query('UPDATE chat_participants SET is_pinned = ? WHERE chat_id = ? AND user_id = ?', [
    isPinned,
    chatId,
    userId,
  ]);
};
