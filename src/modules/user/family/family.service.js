import { pool } from '../../../config/db.js';
import { sendExpoPush } from '../../../utils/push.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const PERMISSION_RANK = { view: 1, edit: 2, add: 3, full: 4 };

const findGroupByMember = async (userId) => {
  const [rows] = await pool.query(
    `SELECT g.* FROM family_groups g
     JOIN family_group_members m ON m.group_id = g.id
     WHERE m.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
};

const attachMembers = async (group) => {
  const [members] = await pool.query(
    `SELECT m.id, u.id AS user_id, u.name, u.avatar_url, m.permission
     FROM family_group_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?
     ORDER BY (u.id = ?) DESC, u.name ASC`,
    [group.id, group.created_by]
  );
  // is_admin computed here rather than as a SQL `(u.id = ?)` boolean - with
  // bigNumberStrings on (config/db.js), mysql2 hands that back as the
  // *string* "0" or "1", and `Boolean("0")` is true in JS (any non-empty
  // string is truthy) - every member silently came back admin.
  return {
    ...group,
    members: members.map((m) => ({ ...m, is_admin: String(m.user_id) === String(group.created_by) })),
  };
};

// Every other function here starts from this - throws 404 if the caller
// isn't part of any family group yet.
const requireMembership = async (userId) => {
  const group = await findGroupByMember(userId);
  if (!group) throw new ApiError(404, 'You are not part of a family group yet');
  const [rows] = await pool.query('SELECT * FROM family_group_members WHERE group_id = ? AND user_id = ?', [
    group.id,
    userId,
  ]);
  return { group, membership: rows[0] };
};

const requirePermission = (membership, minPermission) => {
  if (PERMISSION_RANK[membership.permission] < PERMISSION_RANK[minPermission]) {
    throw new ApiError(403, `Requires "${minPermission}" permission or higher`);
  }
};

// Exported for reminders.service.js's canManageReminder - a family member
// with "edit" permission or higher can manage a reminder a fellow member
// created and shared with them (via the existing generic reminder_recipients
// mechanism), not just view it. "view"/"add" members still can't - "add"
// only covers creating their own new shared reminders, not editing others'.
export const canManageViaFamily = async (creatorUserId, userId) => {
  const [rows] = await pool.query(
    `SELECT m2.permission FROM family_group_members m1
     JOIN family_group_members m2 ON m2.group_id = m1.group_id
     WHERE m1.user_id = ? AND m2.user_id = ?`,
    [creatorUserId, userId]
  );
  const permission = rows[0]?.permission;
  return permission ? PERMISSION_RANK[permission] >= PERMISSION_RANK.edit : false;
};

// --- group ---

export const getMyGroup = async (userId) => {
  const group = await findGroupByMember(userId);
  if (!group) return null;
  return attachMembers(group);
};

export const createGroup = async (userId, { name }) => {
  const existing = await findGroupByMember(userId);
  if (existing) throw new ApiError(409, 'You are already part of a family group');

  const [result] = await pool.query('INSERT INTO family_groups (name, created_by) VALUES (?, ?)', [
    name || 'My Family',
    userId,
  ]);
  const groupId = result.insertId;
  await pool.query('INSERT INTO family_group_members (group_id, user_id, permission) VALUES (?, ?, ?)', [
    groupId,
    userId,
    'full',
  ]);
  const [rows] = await pool.query('SELECT * FROM family_groups WHERE id = ?', [groupId]);
  return attachMembers(rows[0]);
};

export const updateGroup = async (userId, { name }) => {
  const { group, membership } = await requireMembership(userId);
  requirePermission(membership, 'full');
  await pool.query('UPDATE family_groups SET name = ? WHERE id = ?', [name, group.id]);
  const [rows] = await pool.query('SELECT * FROM family_groups WHERE id = ?', [group.id]);
  return attachMembers(rows[0]);
};

// Admin "leaving" deletes the whole group (removes everyone); anyone else
// leaving just drops their own membership row. Both are the same client
// action - the server decides which applies based on who's asking.
export const leaveGroup = async (userId) => {
  const { group } = await requireMembership(userId);
  if (String(group.created_by) === String(userId)) {
    await pool.query('DELETE FROM family_groups WHERE id = ?', [group.id]);
  } else {
    await pool.query('DELETE FROM family_group_members WHERE group_id = ? AND user_id = ?', [group.id, userId]);
  }
};

// --- members ---

// Invitee must already be a registered LifeMate user found by exact mobile
// match - there's no SMS/email delivery configured in this app to invite
// someone who isn't, so unlike the mockup's "pending invite" copy, this adds
// them directly (same as reminder_group_members already does) and just
// notifies them in-app instead of requiring a separate accept step.
export const inviteMember = async (userId, { mobile, permission }) => {
  const { group, membership } = await requireMembership(userId);
  requirePermission(membership, 'full');

  const [userRows] = await pool.query('SELECT id, name, avatar_url FROM users WHERE mobile = ?', [mobile]);
  const invited = userRows[0];
  if (!invited) throw new ApiError(404, 'No LifeMate account found with that mobile number');
  if (String(invited.id) === String(userId)) throw new ApiError(400, "That's your own number");

  const [existing] = await pool.query('SELECT 1 FROM family_group_members WHERE group_id = ? AND user_id = ?', [
    group.id,
    invited.id,
  ]);
  if (existing[0]) throw new ApiError(409, 'This person is already in your family group');

  await pool.query('INSERT INTO family_group_members (group_id, user_id, permission) VALUES (?, ?, ?)', [
    group.id,
    invited.id,
    permission,
  ]);

  const title = "You've been added to a family group";
  const body = `You can now see reminders shared in "${group.name}".`;
  await pool.query(`INSERT INTO notifications (user_id, type, title, body) VALUES (?, 'family', ?, ?)`, [
    invited.id,
    title,
    body,
  ]);
  await sendExpoPush(invited.id, { title, body, data: { type: 'family' } });

  const [rows] = await pool.query('SELECT * FROM family_groups WHERE id = ?', [group.id]);
  return attachMembers(rows[0]);
};

export const updateMemberPermission = async (userId, memberId, { permission }) => {
  const { group, membership } = await requireMembership(userId);
  requirePermission(membership, 'full');

  const [rows] = await pool.query('SELECT * FROM family_group_members WHERE id = ? AND group_id = ?', [
    memberId,
    group.id,
  ]);
  const target = rows[0];
  if (!target) throw new ApiError(404, 'Member not found');
  if (String(target.user_id) === String(group.created_by)) {
    throw new ApiError(400, "Can't change the group admin's permission");
  }

  await pool.query('UPDATE family_group_members SET permission = ? WHERE id = ?', [permission, memberId]);
  const [groupRows] = await pool.query('SELECT * FROM family_groups WHERE id = ?', [group.id]);
  return attachMembers(groupRows[0]);
};

export const removeMember = async (userId, memberId) => {
  const { group, membership } = await requireMembership(userId);
  requirePermission(membership, 'full');

  const [rows] = await pool.query('SELECT * FROM family_group_members WHERE id = ? AND group_id = ?', [
    memberId,
    group.id,
  ]);
  const target = rows[0];
  if (!target) throw new ApiError(404, 'Member not found');
  if (String(target.user_id) === String(group.created_by)) {
    throw new ApiError(400, "Can't remove the group admin");
  }

  await pool.query('DELETE FROM family_group_members WHERE id = ?', [memberId]);
  const [groupRows] = await pool.query('SELECT * FROM family_groups WHERE id = ?', [group.id]);
  return attachMembers(groupRows[0]);
};

// --- shared reminders ---

// There's no family-specific column on reminders at all - "shared" is
// just the existing generic reminder_recipients mechanism (see
// reminders.service.js), scoped to whoever else is in the caller's family
// group. "mine": reminders I created and shared with a fellow member.
// "shared": a fellow member created it and shared it with me. "all" is the
// union, de-duplicated by id.
export const listSharedReminders = async (userId, { filter }) => {
  const { group } = await requireMembership(userId);
  const [memberRows] = await pool.query('SELECT user_id FROM family_group_members WHERE group_id = ?', [group.id]);
  const otherMemberIds = memberRows.map((m) => m.user_id).filter((id) => String(id) !== String(userId));
  if (otherMemberIds.length === 0) return [];

  const mineQuery = `
    SELECT DISTINCT r.*, u.name AS creator_name
    FROM reminders r
    JOIN users u ON u.id = r.user_id
    JOIN reminder_recipients rr ON rr.reminder_id = r.id
    WHERE r.user_id = ? AND r.is_active = TRUE AND rr.user_id IN (?)
  `;
  const sharedQuery = `
    SELECT DISTINCT r.*, u.name AS creator_name
    FROM reminders r
    JOIN users u ON u.id = r.user_id
    JOIN reminder_recipients rr ON rr.reminder_id = r.id
    WHERE rr.user_id = ? AND r.is_active = TRUE AND r.user_id IN (?)
  `;

  let rows;
  if (filter === 'mine') {
    [rows] = await pool.query(mineQuery, [userId, otherMemberIds]);
  } else if (filter === 'shared') {
    [rows] = await pool.query(sharedQuery, [userId, otherMemberIds]);
  } else {
    const [mineRows] = await pool.query(mineQuery, [userId, otherMemberIds]);
    const [sharedRows] = await pool.query(sharedQuery, [userId, otherMemberIds]);
    const byId = new Map();
    [...mineRows, ...sharedRows].forEach((r) => byId.set(r.id, r));
    rows = [...byId.values()];
  }

  rows.sort((a, b) =>
    `${a.reminder_date}${a.reminder_time || ''}`.localeCompare(`${b.reminder_date}${b.reminder_time || ''}`)
  );
  return rows;
};
