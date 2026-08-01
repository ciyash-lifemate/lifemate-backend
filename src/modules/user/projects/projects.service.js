import { pool } from '../../../config/db.js';
import { deleteGroupCascade } from '../reminder-groups/reminder-groups.service.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

// Same correlated-subquery approach as companies.service.js's
// COMPANY_COUNTS_SELECT, for the same reason (two independent counts, no
// row-multiplying JOIN needed). "Tasks" here means Project Tasks
// (reminders.project_id set directly) - not group reminders, which use
// group_id instead and are what group_count already covers separately.
const PROJECT_COUNTS_SELECT = `
  (SELECT COUNT(*) FROM reminder_groups WHERE project_id = p.id) AS group_count,
  (SELECT COUNT(*) FROM reminders WHERE project_id = p.id AND is_active = TRUE) AS task_count
`;

const findProjectById = async (id, userId) => {
  const [rows] = await pool.query(
    `SELECT p.*, ${PROJECT_COUNTS_SELECT} FROM projects p WHERE p.id = ? AND p.user_id = ?`,
    [id, userId]
  );
  return rows[0];
};

const assertCompanyOwned = async (companyId, userId) => {
  const [rows] = await pool.query('SELECT id FROM companies WHERE id = ? AND user_id = ?', [companyId, userId]);
  if (!rows[0]) throw new ApiError(404, 'Company not found');
};

export const createProject = async (userId, { companyId, name, notes }) => {
  await assertCompanyOwned(companyId, userId);
  const [result] = await pool.query(
    'INSERT INTO projects (company_id, user_id, name, notes) VALUES (?, ?, ?, ?)',
    [companyId, userId, name, notes || null]
  );
  return findProjectById(result.insertId, userId);
};

export const listProjects = async (userId, companyId) => {
  await assertCompanyOwned(companyId, userId);
  const [rows] = await pool.query(
    `SELECT p.*, ${PROJECT_COUNTS_SELECT} FROM projects p WHERE p.company_id = ? AND p.user_id = ? ORDER BY p.name ASC`,
    [companyId, userId]
  );
  return rows;
};

export const getProject = async (id, userId) => {
  const project = await findProjectById(id, userId);
  if (!project) throw new ApiError(404, 'Project not found');
  return project;
};

export const updateProject = async (id, userId, { name, notes }) => {
  await getProject(id, userId);
  await pool.query(
    'UPDATE projects SET name = COALESCE(?, name), notes = COALESCE(?, notes) WHERE id = ? AND user_id = ?',
    [name, notes, id, userId]
  );
  return findProjectById(id, userId);
};

export const deleteProject = async (id, userId) => {
  await getProject(id, userId);
  await deleteProjectCascade(id);
};

// Called by companies.service.js when a whole company is deleted, and by
// deleteProject above - no FK constraints in this schema, so cascading
// into groups/members/permissions/reminders has to happen explicitly.
export const deleteProjectCascade = async (projectId) => {
  const [groupRows] = await pool.query('SELECT id FROM reminder_groups WHERE project_id = ?', [projectId]);
  for (const group of groupRows) {
    await deleteGroupCascade(group.id);
  }
  await pool.query('DELETE FROM projects WHERE id = ?', [projectId]);
};
