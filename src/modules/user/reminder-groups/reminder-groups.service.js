import { pool } from '../../../config/db.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const assertProjectOwned = async (projectId, userId) => {
  const [rows] = await pool.query('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  if (!rows[0]) throw new ApiError(404, 'Project not found');
};

const findGroupById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM reminder_groups WHERE id = ?', [id]);
  return rows[0];
};

// Exported for reminders.service.js to gate reads (any member can see a
// group reminder in their own list) without importing the whole module.
export const isGroupMember = async (groupId, userId) => {
  const [rows] = await pool.query('SELECT 1 FROM reminder_group_members WHERE group_id = ? AND user_id = ?', [
    groupId,
    userId,
  ]);
  return Boolean(rows[0]);
};

// Exported for reminders.service.js to gate writes (create/edit/delete/
// complete/add-update) - every member can manage the group's reminders by
// default; true unless the group's creator has switched that one member's
// access off (see reminder_group_restrictions). The creator themself is
// never restricted.
export const canManageGroup = async (groupId, userId) => {
  const group = await findGroupById(groupId);
  if (!group) return false;
  if (String(group.created_by) === String(userId)) return true;
  if (!(await isGroupMember(groupId, userId))) return false;
  const [rows] = await pool.query(
    'SELECT 1 FROM reminder_group_restrictions WHERE group_id = ? AND user_id = ?',
    [groupId, userId]
  );
  return !rows[0];
};

const attachMembers = async (group) => {
  const [members] = await pool.query(
    `SELECT u.id, u.name, u.avatar_url, (u.id = ? OR r.user_id IS NULL) AS can_manage
     FROM reminder_group_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN reminder_group_restrictions r ON r.group_id = m.group_id AND r.user_id = m.user_id
     WHERE m.group_id = ?
     ORDER BY (u.id = ?) DESC, u.name ASC`,
    [group.created_by, group.id, group.created_by]
  );
  return { ...group, members: members.map((m) => ({ ...m, can_manage: Boolean(m.can_manage) })) };
};

export const createGroup = async (userId, { projectId, name, memberUserIds }) => {
  await assertProjectOwned(projectId, userId);
  const [result] = await pool.query(
    'INSERT INTO reminder_groups (project_id, created_by, name) VALUES (?, ?, ?)',
    [projectId, userId, name]
  );
  const groupId = result.insertId;

  const memberIds = [...new Set([userId, ...(memberUserIds || [])])];
  await pool.query('INSERT INTO reminder_group_members (group_id, user_id) VALUES ?', [
    memberIds.map((memberId) => [groupId, memberId]),
  ]);

  return getGroup(groupId, userId);
};

export const listGroups = async (userId, projectId) => {
  await assertProjectOwned(projectId, userId);
  const [rows] = await pool.query(
    'SELECT * FROM reminder_groups WHERE project_id = ? ORDER BY name ASC',
    [projectId]
  );
  return rows;
};

export const getGroup = async (id, userId) => {
  const group = await findGroupById(id);
  if (!group || !(await isGroupMember(id, userId))) throw new ApiError(404, 'Group not found');
  const withMembers = await attachMembers(group);
  const isCreator = String(group.created_by) === String(userId);
  return { ...withMembers, is_creator: isCreator, can_manage: isCreator || (await canManageGroup(id, userId)) };
};

const assertCreator = async (id, userId) => {
  const group = await findGroupById(id);
  if (!group || String(group.created_by) !== String(userId)) throw new ApiError(404, 'Group not found');
  return group;
};

export const updateGroup = async (id, userId, { name }) => {
  await assertCreator(id, userId);
  await pool.query('UPDATE reminder_groups SET name = COALESCE(?, name) WHERE id = ?', [name, id]);
  return getGroup(id, userId);
};

export const toggleSelfReminder = async (id, userId, enabled) => {
  await assertCreator(id, userId);
  await pool.query('UPDATE reminder_groups SET creator_self_reminder = ? WHERE id = ?', [Boolean(enabled), id]);
  return getGroup(id, userId);
};

export const addMembers = async (id, userId, userIds) => {
  await assertCreator(id, userId);
  const uniqueIds = [...new Set(userIds || [])];
  if (uniqueIds.length) {
    await pool.query(
      'INSERT IGNORE INTO reminder_group_members (group_id, user_id) VALUES ?',
      [uniqueIds.map((memberId) => [id, memberId])]
    );
  }
  return getGroup(id, userId);
};

export const removeMember = async (id, userId, targetUserId) => {
  const group = await assertCreator(id, userId);
  if (String(group.created_by) === String(targetUserId)) {
    throw new ApiError(400, 'The group creator cannot be removed');
  }
  await pool.query('DELETE FROM reminder_group_members WHERE group_id = ? AND user_id = ?', [id, targetUserId]);
  await pool.query('DELETE FROM reminder_group_restrictions WHERE group_id = ? AND user_id = ?', [id, targetUserId]);
  return getGroup(id, userId);
};

// Turns a member's manage access on/off. Everyone has it by default (see
// canManageGroup) - "on" just clears any existing restriction, "off" adds
// one. The creator can't be restricted (they're never gated by this table).
export const setMemberAccess = async (id, userId, targetUserId, enabled) => {
  const group = await assertCreator(id, userId);
  if (String(group.created_by) === String(targetUserId)) {
    throw new ApiError(400, 'The group creator always has full access');
  }
  if (!(await isGroupMember(id, targetUserId))) {
    throw new ApiError(400, 'That person must be a group member');
  }
  if (enabled) {
    await pool.query('DELETE FROM reminder_group_restrictions WHERE group_id = ? AND user_id = ?', [id, targetUserId]);
  } else {
    await pool.query(
      'INSERT IGNORE INTO reminder_group_restrictions (group_id, user_id, restricted_by) VALUES (?, ?, ?)',
      [id, targetUserId, userId]
    );
  }
  return getGroup(id, userId);
};

export const deleteGroup = async (id, userId) => {
  await assertCreator(id, userId);
  await deleteGroupCascade(id);
};

// Called by projects.service.js (whole project deleted) and by
// deleteGroup above - no FK constraints in this schema, so members/
// permissions are deleted explicitly and the group's reminders are
// soft-deleted (is_active=FALSE) the same way a normal reminder delete
// works, rather than hard-deleted.
export const deleteGroupCascade = async (groupId) => {
  await pool.query('DELETE FROM reminder_group_restrictions WHERE group_id = ?', [groupId]);
  await pool.query('DELETE FROM reminder_group_members WHERE group_id = ?', [groupId]);
  await pool.query('UPDATE reminders SET is_active = FALSE WHERE group_id = ?', [groupId]);
  await pool.query('DELETE FROM reminder_groups WHERE id = ?', [groupId]);
};
