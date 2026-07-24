import { pool } from '../../../config/db.js';

const SAFE_FIELDS = 'id, name, email, created_at';

export const findAdminById = async (id) => {
  const [rows] = await pool.query(`SELECT ${SAFE_FIELDS} FROM admins WHERE id = ?`, [id]);
  return rows[0];
};

export const findAdminByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM admins WHERE email = ?', [email]);
  return rows[0];
};

export const createAdmin = async ({ name, email, passwordHash }) => {
  const [result] = await pool.query(
    'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, passwordHash]
  );
  return findAdminById(result.insertId);
};
