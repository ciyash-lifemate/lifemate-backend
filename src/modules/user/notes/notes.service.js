import { pool } from '../../../config/db.js';
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const findNoteById = async (id, userId) => {
  const [rows] = await pool.query('SELECT * FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0];
};

export const createNote = async (userId, { title, content, color }) => {
  const [result] = await pool.query(
    'INSERT INTO notes (user_id, title, content, color) VALUES (?, ?, ?, ?)',
    [userId, title, content, color || null]
  );
  return findNoteById(result.insertId, userId);
};

export const listNotes = async (userId, { search, page = 1, pageSize = 20 } = {}) => {
  const params = [userId];
  let where = 'WHERE user_id = ?';
  if (search) {
    where += ' AND (title LIKE ? OR content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT * FROM notes ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notes ${where}`, params);
  return { items: rows, total: Number(total), page, pageSize };
};

export const getNote = async (id, userId) => {
  const note = await findNoteById(id, userId);
  if (!note) throw new ApiError(404, 'Note not found');
  return note;
};

export const updateNote = async (id, userId, { title, content, color }) => {
  await getNote(id, userId);
  await pool.query(
    `UPDATE notes SET
      title = COALESCE(?, title),
      content = COALESCE(?, content),
      color = COALESCE(?, color)
     WHERE id = ? AND user_id = ?`,
    [title, content, color, id, userId]
  );
  return findNoteById(id, userId);
};

export const deleteNote = async (id, userId) => {
  const [result] = await pool.query('DELETE FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
  if (result.affectedRows === 0) throw new ApiError(404, 'Note not found');
};
