import { pool } from '../../../config/db.js';
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}
import { notifyReminderCreated, notifyGroupReminderEvent } from '../notifications/notifications.service.js';
import { canManageGroup } from '../reminder-groups/reminder-groups.service.js';

// A reminder is visible to its owner, plus: every member of its Group (see
// reminders.group_id / reminder_group_members), and anyone it was
// individually shared with via reminder_recipients (e.g. a Project Task's
// single assignee, or any type's "also remind" picker) - so it actually
// shows up in each of their own Home/Calendar/list, not just as a one-off
// push at due time. Two subqueries, so callers pass userId three times.
const SHARED_VISIBILITY_CLAUSE = `
  OR group_id IN (SELECT group_id FROM reminder_group_members WHERE user_id = ?)
  OR id IN (SELECT reminder_id FROM reminder_recipients WHERE user_id = ?)
`;

// Same visibility rule as SHARED_VISIBILITY_CLAUSE below, just re-qualified
// with the r./u. aliases this query needs for its creator-name join - kept
// as a literal string rather than derived from that constant, since a
// mechanical find/replace on column names too easily corrupts an unrelated
// identifier that happens to contain the same substring (e.g. "user_id").
const findReminderById = async (id, userId) => {
  const [rows] = await pool.query(
    `SELECT r.*, u.name AS creator_name, u.avatar_url AS creator_avatar_url
     FROM reminders r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = ? AND r.is_active = TRUE AND (
       r.user_id = ?
       OR r.group_id IN (SELECT group_id FROM reminder_group_members WHERE user_id = ?)
       OR r.id IN (SELECT reminder_id FROM reminder_recipients WHERE user_id = ?)
     )`,
    [id, userId, userId, userId]
  );
  if (!rows[0]) return rows[0];
  return { ...rows[0], recipients: await getRecipients(id) };
};

// --- sharing a reminder with other app users (see reminder_recipients in
// migrate.mjs) - generic across every reminder type: the flat legacy
// Company form, any Quick Add type's "also remind" picker, and a Project
// Task's single assignee (clamped to one entry in createReminder below).
// Group reminders (reminders.group_id set) don't use this - their
// recipients are derived from reminder_group_members instead, see
// getGroupTargetUserIds.

const getRecipients = async (reminderId) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.avatar_url FROM reminder_recipients rr
     JOIN users u ON u.id = rr.user_id WHERE rr.reminder_id = ?`,
    [reminderId]
  );
  return rows;
};

export const getRecipientUserIds = async (reminderId) => {
  const [rows] = await pool.query('SELECT user_id FROM reminder_recipients WHERE reminder_id = ?', [
    reminderId,
  ]);
  return rows.map((row) => row.user_id);
};

const isReminderRecipient = async (reminderId, userId) => {
  const [rows] = await pool.query(
    'SELECT 1 FROM reminder_recipients WHERE reminder_id = ? AND user_id = ?',
    [reminderId, userId]
  );
  return Boolean(rows[0]);
};

// Replaces the full recipient set rather than diffing it - callers always
// pass the complete desired list (the recipient picker resends everyone
// selected), so this stays a delete+insert instead of tracking adds/removes.
const setRecipients = async (reminderId, userId, userIds) => {
  if (userIds === undefined) return;
  await pool.query('DELETE FROM reminder_recipients WHERE reminder_id = ?', [reminderId]);
  const uniqueIds = [...new Set(userIds || [])].filter((recipientId) => recipientId !== userId);
  if (!uniqueIds.length) return;
  await pool.query('INSERT INTO reminder_recipients (reminder_id, user_id) VALUES ?', [
    uniqueIds.map((recipientId) => [reminderId, recipientId]),
  ]);
};

// Who's allowed to edit/delete/complete a reminder, or add a work-log
// update to it: the reminder's own creator, or - for a group reminder -
// the group's creator or anyone the group creator granted manage rights to.
const canManageReminder = async (reminder, userId) => {
  if (String(reminder.user_id) === String(userId)) return true;
  if (!reminder.group_id) return false;
  return canManageGroup(reminder.group_id, userId);
};

const requireManage = async (reminder, userId) => {
  if (!(await canManageReminder(reminder, userId))) {
    throw new ApiError(403, 'You do not have permission to manage this reminder');
  }
};

export const createReminder = async (
  userId,
  {
    type,
    title,
    description,
    reminderDate,
    reminderTime,
    repeatType,
    dosage,
    recipientMobile,
    wishMessage,
    checklistItems,
    voiceMessage,
    recipientUserIds,
    groupId,
    projectId,
    selfReminder,
  }
) => {
  if (groupId && !(await canManageGroup(groupId, userId))) {
    throw new ApiError(403, 'You do not have permission to post reminders to this group');
  }
  if (projectId) {
    const [projectRows] = await pool.query('SELECT id FROM projects WHERE id = ? AND user_id = ?', [
      projectId,
      userId,
    ]);
    if (!projectRows[0]) throw new ApiError(404, 'Project not found');
  }
  // A Task has at most one assignee - clamped here rather than fought over
  // in Joi, since the same recipientUserIds field is shared with every
  // other reminder type's "also remind" picker, which allows several.
  const clampedRecipientIds = projectId ? (recipientUserIds || []).slice(0, 1) : recipientUserIds;

  const [result] = await pool.query(
    `INSERT INTO reminders
      (user_id, type, title, description, reminder_date, reminder_time, repeat_type, dosage,
       recipient_mobile, wish_message, checklist_items, voice_message, group_id, project_id, self_reminder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      groupId ? 'company' : projectId ? 'task' : type,
      title,
      description || null,
      reminderDate,
      reminderTime || null,
      repeatType || 'none',
      dosage || null,
      recipientMobile || null,
      wishMessage || null,
      checklistItems?.length ? JSON.stringify(checklistItems) : null,
      voiceMessage || null,
      groupId || null,
      projectId || null,
      selfReminder === false ? false : true,
    ]
  );

  if (!groupId) await setRecipients(result.insertId, userId, clampedRecipientIds);
  const reminder = await findReminderById(result.insertId, userId);
  await notifyReminderCreated(userId, reminder);

  if (groupId) {
    // Ping every other member right away ("assigned to you") in addition
    // to the normal due-date/time alarm the scheduler sends later.
    const [members] = await pool.query('SELECT user_id FROM reminder_group_members WHERE group_id = ?', [
      groupId,
    ]);
    const otherMemberIds = members
      .map((m) => m.user_id)
      .filter((memberId) => String(memberId) !== String(userId));
    if (otherMemberIds.length) {
      await notifyGroupReminderEvent(otherMemberIds, {
        title: reminder.title,
        body: 'A new reminder was assigned to your group',
        referenceId: reminder.id,
        groupId,
      });
    }
  } else if (projectId && clampedRecipientIds?.length) {
    // Same idea, single-assignee version - the task's one recipient finds
    // out right away instead of waiting for the due-date alarm.
    await notifyGroupReminderEvent(clampedRecipientIds, {
      title: reminder.title,
      body: 'A new task was assigned to you',
      referenceId: reminder.id,
      projectId,
    });
  } else if (!projectId) {
    // Plain shared reminder (e.g. a Business Note) - notify whoever it was
    // actually saved with (setRecipients already deduped and dropped the
    // owner) right away, same as Group/Task above, instead of only ever
    // reaching them via the due-date alarm.
    const savedRecipientIds = await getRecipientUserIds(reminder.id);
    if (savedRecipientIds.length) {
      await notifyGroupReminderEvent(savedRecipientIds, {
        title: reminder.title,
        body: 'Shared a reminder with you',
        referenceId: reminder.id,
      });
    }
  }

  return reminder;
};

export const getReminder = async (id, userId) => {
  const reminder = await findReminderById(id, userId);
  if (!reminder) throw new ApiError(404, 'Reminder not found');
  // The client needs this to know whether to show edit/delete/complete/
  // add-update controls for a group reminder it can only read, not manage.
  return { ...reminder, can_manage: await canManageReminder(reminder, userId) };
};

export const listReminders = async (
  userId,
  { type, from, to, groupId, projectId, page = 1, pageSize = 50 } = {}
) => {
  const params = [userId, userId, userId];
  let where = `WHERE (user_id = ? ${SHARED_VISIBILITY_CLAUSE}) AND is_active = TRUE`;

  if (groupId) {
    // Scoped to one group's reminders (e.g. the Group detail screen) -
    // the visibility clause above already guarantees the caller may see it.
    where += ' AND group_id = ?';
    params.push(groupId);
  }
  if (projectId) {
    // Scoped to one project's tasks (e.g. the Project detail screen).
    where += ' AND project_id = ?';
    params.push(projectId);
  }
  if (type) {
    where += ' AND type = ?';
    params.push(type);
  }
  if (from) {
    where += ' AND reminder_date >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND reminder_date <= ?';
    params.push(to);
  }

  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query(
    `SELECT * FROM reminders ${where} ORDER BY reminder_date ASC, reminder_time ASC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reminders ${where}`, params);
  return { items: rows, total: Number(total), page, pageSize };
};

// reminder_date/reminder_time are plain IST wall-clock values entered on the
// phone, but this DB's session clock (CURDATE()/CURTIME()/NOW()) runs in
// UTC - shifting by +5:30 here converts "now" to the IST calendar day/time
// the reminders were actually meant to compare against. All users are
// assumed to be in India for now; there's no per-user timezone field yet.
const IST_OFFSET_SQL = 'NOW() + INTERVAL 330 MINUTE';

export const listTodayReminders = async (userId) => {
  const [rows] = await pool.query(
    `SELECT * FROM reminders
     WHERE (user_id = ? ${SHARED_VISIBILITY_CLAUSE}) AND is_active = TRUE AND reminder_date = DATE(${IST_OFFSET_SQL})
     ORDER BY reminder_time ASC`,
    [userId, userId, userId]
  );
  return rows;
};

// Groups a date-range listing by reminder_date for the calendar view. Always
// bounded by the from/to month range already, so this asks listReminders for
// a generously large page instead of paging through it - the grid needs
// every reminder in the visible month at once, not a "load more" scroll.
export const listCalendarReminders = async (userId, { from, to }) => {
  const { items } = await listReminders(userId, { from, to, pageSize: 1000 });
  return items.reduce((byDate, reminder) => {
    (byDate[reminder.reminder_date] ||= []).push(reminder);
    return byDate;
  }, {});
};

export const updateReminder = async (
  id,
  userId,
  {
    title,
    description,
    reminderDate,
    reminderTime,
    repeatType,
    dosage,
    recipientMobile,
    wishMessage,
    checklistItems,
    voiceMessage,
    recipientUserIds,
    selfReminder,
  }
) => {
  const reminder = await getReminder(id, userId);
  await requireManage(reminder, userId);
  if (!reminder.group_id) {
    // A Task still has at most one assignee on update, same as creation.
    const clampedRecipientIds = reminder.project_id ? recipientUserIds?.slice(0, 1) : recipientUserIds;
    await setRecipients(id, userId, clampedRecipientIds);
  }
  // A group reminder's description is write-once - progress goes through
  // addReminderUpdate's append-only work-log instead of overwriting it.
  const descriptionForUpdate = reminder.group_id ? undefined : description;
  await pool.query(
    `UPDATE reminders SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      reminder_date = COALESCE(?, reminder_date),
      reminder_time = COALESCE(?, reminder_time),
      repeat_type = COALESCE(?, repeat_type),
      dosage = COALESCE(?, dosage),
      recipient_mobile = COALESCE(?, recipient_mobile),
      wish_message = COALESCE(?, wish_message),
      checklist_items = COALESCE(?, checklist_items),
      voice_message = COALESCE(?, voice_message),
      self_reminder = COALESCE(?, self_reminder),
      -- moving the date/time means "already notified today" no longer
      -- applies to the new schedule, so let the scheduler re-evaluate it
      last_notified_date = IF(? IS NOT NULL OR ? IS NOT NULL, NULL, last_notified_date)
     WHERE id = ?`,
    [
      title,
      descriptionForUpdate,
      reminderDate,
      reminderTime,
      repeatType,
      dosage,
      recipientMobile,
      wishMessage,
      checklistItems ? JSON.stringify(checklistItems) : null,
      voiceMessage,
      selfReminder,
      reminderDate,
      reminderTime,
      id,
    ]
  );
  return findReminderById(id, userId);
};

export const setReminderCompleted = async (id, userId, isCompleted) => {
  const reminder = await getReminder(id, userId);
  // Deliberately narrower than requireManage: a Project Task's assignee can
  // check it off (the whole point of delegating it to them) without gaining
  // edit/delete rights, which stay owner-only.
  const canComplete =
    (await canManageReminder(reminder, userId)) ||
    (reminder.project_id && (await isReminderRecipient(id, userId)));
  if (!canComplete) throw new ApiError(403, 'You do not have permission to manage this reminder');
  await pool.query('UPDATE reminders SET is_completed = ? WHERE id = ?', [isCompleted, id]);
  return findReminderById(id, userId);
};

export const deleteReminder = async (id, userId) => {
  const reminder = await getReminder(id, userId);
  await requireManage(reminder, userId);
  await pool.query('UPDATE reminders SET is_active = FALSE WHERE id = ?', [id]);
};

// --- append-only work-log for a group reminder (see reminder_updates) ---

export const listReminderUpdates = async (reminderId, userId) => {
  await getReminder(reminderId, userId); // 404s / enforces read access (owner or group member)
  const [rows] = await pool.query(
    `SELECT ru.id, ru.note, ru.created_at, u.id AS user_id, u.name AS user_name, u.avatar_url AS user_avatar_url
     FROM reminder_updates ru
     JOIN users u ON u.id = ru.user_id
     WHERE ru.reminder_id = ?
     ORDER BY ru.id ASC`,
    [reminderId]
  );
  return rows;
};

export const addReminderUpdate = async (reminderId, userId, note) => {
  const reminder = await getReminder(reminderId, userId);
  await requireManage(reminder, userId);
  await pool.query('INSERT INTO reminder_updates (reminder_id, user_id, note) VALUES (?, ?, ?)', [
    reminderId,
    userId,
    note,
  ]);

  if (reminder.group_id) {
    const [members] = await pool.query('SELECT user_id FROM reminder_group_members WHERE group_id = ?', [
      reminder.group_id,
    ]);
    const otherMemberIds = members
      .map((m) => m.user_id)
      .filter((memberId) => String(memberId) !== String(userId));
    if (otherMemberIds.length) {
      await notifyGroupReminderEvent(otherMemberIds, {
        title: reminder.title,
        body: 'New update on a reminder in your group',
        referenceId: reminderId,
        groupId: reminder.group_id,
      });
    }
  }

  return listReminderUpdates(reminderId, userId);
};

// --- background scheduler (see reminders.scheduler.js) ---

// A reminder is "due" once for each occurrence its repeat_type implies,
// gated by last_notified_date so a reminder that's due all day only fires
// once. reminder_time = NULL means "any time today" (fires on the first
// tick after midnight).
export const listDueReminders = async () => {
  const [rows] = await pool.query(
    `SELECT * FROM reminders
     WHERE is_active = TRUE
       AND is_completed = FALSE
       AND (last_notified_date IS NULL OR last_notified_date < DATE(${IST_OFFSET_SQL}))
       AND (reminder_time IS NULL OR reminder_time <= TIME(${IST_OFFSET_SQL}))
       AND (
         (repeat_type = 'none' AND reminder_date = DATE(${IST_OFFSET_SQL}))
         OR repeat_type = 'daily'
         OR (repeat_type = 'weekly' AND DAYOFWEEK(reminder_date) = DAYOFWEEK(${IST_OFFSET_SQL}))
         OR (repeat_type = 'monthly' AND DAY(reminder_date) = DAY(${IST_OFFSET_SQL}))
         OR (repeat_type = 'yearly' AND MONTH(reminder_date) = MONTH(${IST_OFFSET_SQL}) AND DAY(reminder_date) = DAY(${IST_OFFSET_SQL}))
       )`
  );
  return rows;
};

// Everyone who should be pushed when a group reminder falls due: every
// member, except the group's own creator when they've turned their
// personal self-reminder toggle off (other members never get that choice).
export const getGroupTargetUserIds = async (groupId) => {
  const [rows] = await pool.query(
    `SELECT m.user_id FROM reminder_group_members m
     JOIN reminder_groups g ON g.id = m.group_id
     WHERE m.group_id = ? AND (g.creator_self_reminder = TRUE OR m.user_id <> g.created_by)`,
    [groupId]
  );
  return rows.map((row) => row.user_id);
};

export const markReminderNotified = async (id) => {
  await pool.query(`UPDATE reminders SET last_notified_date = DATE(${IST_OFFSET_SQL}) WHERE id = ?`, [id]);
};
