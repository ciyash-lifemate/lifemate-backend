import { pool } from '../../../config/db.js';
import { deleteProjectCascade } from '../projects/projects.service.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const findCompanyById = async (id, userId) => {
  const [rows] = await pool.query('SELECT * FROM companies WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0];
};

export const createCompany = async (userId, { name, notes }) => {
  const [result] = await pool.query('INSERT INTO companies (user_id, name, notes) VALUES (?, ?, ?)', [
    userId,
    name,
    notes || null,
  ]);
  return findCompanyById(result.insertId, userId);
};

export const listCompanies = async (userId) => {
  const [rows] = await pool.query('SELECT * FROM companies WHERE user_id = ? ORDER BY name ASC', [userId]);
  return rows;
};

export const getCompany = async (id, userId) => {
  const company = await findCompanyById(id, userId);
  if (!company) throw new ApiError(404, 'Company not found');
  return company;
};

export const updateCompany = async (id, userId, { name, notes }) => {
  await getCompany(id, userId);
  await pool.query('UPDATE companies SET name = COALESCE(?, name), notes = COALESCE(?, notes) WHERE id = ? AND user_id = ?', [
    name,
    notes,
    id,
    userId,
  ]);
  return findCompanyById(id, userId);
};

// No FK constraints in this schema - cascading into projects/groups/
// reminders has to be done explicitly here rather than left to the DB.
export const deleteCompany = async (id, userId) => {
  await getCompany(id, userId);
  const [projectRows] = await pool.query('SELECT id FROM projects WHERE company_id = ?', [id]);
  for (const project of projectRows) {
    await deleteProjectCascade(project.id);
  }
  await pool.query('DELETE FROM companies WHERE id = ? AND user_id = ?', [id, userId]);
};
