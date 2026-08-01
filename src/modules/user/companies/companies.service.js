import { pool } from '../../../config/db.js';
import { deleteProjectCascade } from '../projects/projects.service.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

// Aggregate counts as correlated subqueries rather than a JOIN+GROUP BY -
// simplest way to combine three independent counts (projects directly,
// groups/members through the project->group chain) without the row
// multiplication a multi-table JOIN would need DISTINCT/GROUP BY gymnastics
// to avoid. Fine at this scale (a handful of companies per user).
const COMPANY_COUNTS_SELECT = `
  (SELECT COUNT(*) FROM projects WHERE company_id = c.id) AS project_count,
  (SELECT COUNT(*) FROM reminder_groups g JOIN projects p ON p.id = g.project_id WHERE p.company_id = c.id) AS group_count
`;

const findCompanyById = async (id, userId) => {
  const [rows] = await pool.query(`SELECT c.*, ${COMPANY_COUNTS_SELECT} FROM companies c WHERE c.id = ? AND c.user_id = ?`, [
    id,
    userId,
  ]);
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
  const [rows] = await pool.query(
    `SELECT c.*, ${COMPANY_COUNTS_SELECT} FROM companies c WHERE c.user_id = ? ORDER BY c.name ASC`,
    [userId]
  );
  return rows;
};

export const getCompany = async (id, userId) => {
  const company = await findCompanyById(id, userId);
  if (!company) throw new ApiError(404, 'Company not found');
  // Distinct people across every group under every project of this company -
  // "Members" on the details screen. A separate query rather than folded
  // into COMPANY_COUNTS_SELECT since COUNT(DISTINCT ...) needs its own
  // fully-qualified join chain, not another bare correlated subquery.
  const [[{ member_count }]] = await pool.query(
    `SELECT COUNT(DISTINCT m.user_id) AS member_count
     FROM reminder_group_members m
     JOIN reminder_groups g ON g.id = m.group_id
     JOIN projects p ON p.id = g.project_id
     WHERE p.company_id = ?`,
    [id]
  );
  return { ...company, member_count: Number(member_count) };
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
