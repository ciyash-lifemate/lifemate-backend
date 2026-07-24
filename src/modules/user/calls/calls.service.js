import { pool } from '../../../config/db.js';
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const assertParticipant = async (chatId, userId) => {
  const [rows] = await pool.query(
    'SELECT 1 FROM chat_participants WHERE chat_id = ? AND user_id = ?',
    [chatId, userId]
  );
  if (rows.length === 0) throw new ApiError(404, 'Chat not found');
};

const findCallById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM call_logs WHERE id = ?', [id]);
  return rows[0];
};

// The signaling itself (offer/answer/ICE candidates) travels over Socket.IO
// only (see realtime/socket.js) - these rows exist purely for call history.

export const startCall = async (chatId, callerId, calleeId, callType) => {
  await assertParticipant(chatId, callerId);
  const [result] = await pool.query(
    'INSERT INTO call_logs (chat_id, caller_id, callee_id, call_type) VALUES (?, ?, ?, ?)',
    [chatId, callerId, calleeId, callType]
  );
  return findCallById(result.insertId);
};

export const answerCall = async (callId) => {
  await pool.query(
    `UPDATE call_logs SET status = 'answered', answered_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [callId]
  );
  return findCallById(callId);
};

export const endCall = async (callId, { rejected = false } = {}) => {
  const call = await findCallById(callId);
  if (!call) return;

  const status = rejected ? 'rejected' : call.status === 'answered' ? 'ended' : 'missed';
  const durationSeconds =
    status === 'ended' ? Math.max(0, Math.round((Date.now() - new Date(call.answered_at).getTime()) / 1000)) : null;

  await pool.query(
    `UPDATE call_logs SET status = ?, ended_at = CURRENT_TIMESTAMP, duration_seconds = ? WHERE id = ?`,
    [status, durationSeconds, callId]
  );
  return findCallById(callId);
};

export const listCallHistory = async (userId) => {
  const [rows] = await pool.query(
    `SELECT
      cl.*,
      ou.id AS other_user_id,
      ou.name AS other_user_name,
      ou.avatar_url AS other_user_avatar
     FROM call_logs cl
     JOIN users ou ON ou.id = (CASE WHEN cl.caller_id = ? THEN cl.callee_id ELSE cl.caller_id END)
     WHERE cl.caller_id = ? OR cl.callee_id = ?
     ORDER BY cl.started_at DESC
     LIMIT 100`,
    [userId, userId, userId]
  );
  return rows.map((row) => ({ ...row, direction: Number(row.caller_id) === Number(userId) ? 'outgoing' : 'incoming' }));
};
