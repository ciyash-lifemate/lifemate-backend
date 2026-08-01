import { pool } from '../src/config/db.js';

// Ordered so that FK-less references (user_id, chat_id, ...) always point at
// a table created earlier. TiDB tables use AUTO_RANDOM ids (see config/db.js)
// so ids are BIGINT and not sequential - mysql2 is configured accordingly.

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    google_id VARCHAR(64) UNIQUE,
    mobile VARCHAR(20) UNIQUE,
    email VARCHAR(150) UNIQUE,
    name VARCHAR(100),
    avatar_url VARCHAR(500),
    date_of_birth DATE,
    language VARCHAR(30) DEFAULT 'English',
    is_profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS admins (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS otp_verifications (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    mobile VARCHAR(20) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_mobile (mobile)
  )`,

  `CREATE TABLE IF NOT EXISTS banners (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    title VARCHAR(150) NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    link_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS reminders (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL,
    type ENUM('medicine','birthday','anniversary','note','task','custom') NOT NULL,
    title VARCHAR(150) NOT NULL,
    description VARCHAR(1000),
    reminder_date DATE NOT NULL,
    reminder_time TIME,
    repeat_type ENUM('none','daily','weekly','monthly','yearly') NOT NULL DEFAULT 'none',
    dosage VARCHAR(50),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_reminders_user_date (user_id, reminder_date)
  )`,

  // Guards the background scheduler (modules/user/reminders/reminders.scheduler.js)
  // against re-notifying the same occurrence on every poll tick.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS last_notified_date DATE NULL`,

  // Birthday/anniversary wish-sending: the due-reminder push carries these so
  // the app can open WhatsApp pre-filled with the chosen message for this
  // recipient - there's no way to auto-send through the real WhatsApp app
  // without the (paid, business-verified) WhatsApp Business Cloud API, so
  // this is a "one tap to send" flow, not a silent auto-send.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recipient_mobile VARCHAR(20) NULL`,
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS wish_message VARCHAR(500) NULL`,

  // Agenda/todo items for an event or meeting reminder - a JSON array of
  // {text, done} objects, editable via the "+" add-item control in the
  // event reminder form. Nullable/generic like dosage/wish_message rather
  // than type-restricted, so no schema change is needed if another type
  // wants a checklist later.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS checklist_items JSON NULL`,

  // Free-text spoken message for a reminder - read aloud via expo-speech
  // once the due-reminder alert sound finishes (see ReminderAlertWatcher.js
  // and _layout.js on the mobile side). Generic/optional like the other
  // reminder-form extras above, available on every reminder type.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS voice_message VARCHAR(500) NULL`,

  // Widen the type enum to cover "Recharge" / "Event" / "Alarm" / "Company"
  // (Quick Add on Home). MODIFY COLUMN re-runs safely as long as it's always
  // a superset of whatever types already exist in the data - the earlier,
  // narrower intermediate versions of this same statement (recharge-only,
  // then +event, then +alarm as a separate statement before +company was
  // folded in here) were removed rather than kept as history, since
  // replaying an outdated one against rows that already have a later type
  // (e.g. 'company') truncates them.
  `ALTER TABLE reminders MODIFY COLUMN type
    ENUM('medicine','birthday','anniversary','note','task','custom','recharge','event','alarm','company') NOT NULL`,

  // Lets a reminder be shared with other app users in addition to its owner -
  // one row per recipient, so sending to a group is just inserting several
  // rows for the same reminder_id. Used by the Company reminder form today,
  // but deliberately not type-restricted so any reminder type could adopt it.
  `CREATE TABLE IF NOT EXISTS reminder_recipients (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    reminder_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder_recipient (reminder_id, user_id),
    INDEX idx_reminder_recipients_user (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS notes (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL,
    title VARCHAR(150) NOT NULL,
    content TEXT,
    color VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_notes_user (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL,
    type ENUM('reminder','chat','system') NOT NULL DEFAULT 'system',
    title VARCHAR(150) NOT NULL,
    body VARCHAR(500),
    reference_id BIGINT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user (user_id, is_read)
  )`,

  `CREATE TABLE IF NOT EXISTS chats (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    is_group BOOLEAN NOT NULL DEFAULT FALSE,
    name VARCHAR(150),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS chat_participants (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    chat_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    last_read_message_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_chat_participant (chat_id, user_id),
    INDEX idx_chat_participants_user (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    chat_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    content VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_messages_chat (chat_id, id)
  )`,

  // messages.content is required above for older TiDB clusters that don't
  // support "ADD COLUMN IF NOT EXISTS" on a fresh CREATE; relaxed here for
  // media-only messages (image/video/audio with no caption). TEXT (not
  // VARCHAR(2000)) because content is stored AES-256-GCM-encrypted + base64,
  // which runs noticeably longer than the plaintext it came from.
  `ALTER TABLE messages MODIFY COLUMN content TEXT NULL`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type
    ENUM('text','image','video','audio','voice','document','location') NOT NULL DEFAULT 'text'`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url VARCHAR(500)`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_name VARCHAR(255)`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_size BIGINT`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_mime VARCHAR(100)`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration INT`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS status
    ENUM('sent','delivered','read') NOT NULL DEFAULT 'sent'`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP NULL`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP NULL`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE`,

  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NULL`,

  // Digital business/visiting card, shareable via WhatsApp from the Profile
  // screen - deliberately separate from name/email above so the card can
  // carry different values (e.g. a work email) than the login profile.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_name VARCHAR(100) NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_designation VARCHAR(100) NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_company VARCHAR(150) NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_phone VARCHAR(20) NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_email VARCHAR(150) NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_website VARCHAR(255) NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_address VARCHAR(255) NULL`,
  // Which of the 10 built-in visual card designs (see
  // mobile:src/constants/cardTemplates.js) the user picked for their card.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS card_template VARCHAR(30) NULL`,

  // Per-participant "clear chat" - hides everything up to this message id for
  // that participant only, without touching the other participant's view or
  // the rows themselves.
  `ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS cleared_before_message_id BIGINT NULL`,

  // "Delete for me" - hides one message for one participant only, unlike
  // messages.is_deleted (which is the "delete for everyone" flag and clears
  // the content for both sides).
  `CREATE TABLE IF NOT EXISTS message_deletions (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    message_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_message_deletion (message_id, user_id),
    INDEX idx_message_deletions_user (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS device_tokens (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL,
    expo_push_token VARCHAR(255) NOT NULL,
    platform ENUM('ios','android','web') NOT NULL DEFAULT 'android',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_device_token (expo_push_token),
    INDEX idx_device_tokens_user (user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS call_logs (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    chat_id BIGINT NOT NULL,
    caller_id BIGINT NOT NULL,
    callee_id BIGINT NOT NULL,
    call_type ENUM('audio','video') NOT NULL,
    status ENUM('missed','answered','rejected','ended') NOT NULL DEFAULT 'missed',
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP NULL,
    ended_at TIMESTAMP NULL,
    duration_seconds INT,
    INDEX idx_call_logs_chat (chat_id, id),
    INDEX idx_call_logs_caller (caller_id),
    INDEX idx_call_logs_callee (callee_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ai_messages (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL,
    role ENUM('user','assistant') NOT NULL,
    content VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_messages_user (user_id, id)
  )`,

  `CREATE TABLE IF NOT EXISTS user_settings (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL UNIQUE,
    push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    reminder_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    chat_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // Company -> Project -> Group -> Reminder hierarchy (business follow-ups).
  // Each user manages their own companies; projects live under a company,
  // groups (of other app users) live under a project, and reminders posted
  // to a group notify every member (see reminders.group_id below).
  `CREATE TABLE IF NOT EXISTS companies (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL,
    name VARCHAR(150) NOT NULL,
    notes VARCHAR(1000),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_companies_user (user_id)
  )`,

  // user_id is denormalized from companies.user_id (a project's owner is
  // always its company's owner - no delegation at this level) so project
  // queries stay a flat WHERE id=? AND user_id=? like the rest of this
  // file, instead of a JOIN back to companies.
  `CREATE TABLE IF NOT EXISTS projects (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    company_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    name VARCHAR(150) NOT NULL,
    notes VARCHAR(1000),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_projects_company (company_id)
  )`,

  // Named reminder_groups, not "groups" - GROUPS is a reserved word in
  // MySQL 8.0.19+/TiDB. No description column - the task content lives on
  // the reminders inside the group, not on the group itself.
  `CREATE TABLE IF NOT EXISTS reminder_groups (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    project_id BIGINT NOT NULL,
    created_by BIGINT NOT NULL,
    name VARCHAR(150) NOT NULL,
    creator_self_reminder BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_reminder_groups_project (project_id)
  )`,

  `CREATE TABLE IF NOT EXISTS reminder_group_members (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    group_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder_group_member (group_id, user_id),
    INDEX idx_reminder_group_members_user (user_id)
  )`,

  // Superseded by reminder_group_restrictions below (every member manages
  // reminders by default now, not just whoever's granted) - left in place
  // unused rather than dropped, since nothing in this file ever drops a
  // table and no real data was ever written here.
  `CREATE TABLE IF NOT EXISTS reminder_group_permissions (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    group_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    granted_by BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder_group_permission (group_id, user_id),
    INDEX idx_reminder_group_permissions_user (user_id)
  )`,

  // Every group member has full manage rights (create/edit/delete/complete/
  // add-update) on the group's reminders by default - presence of a row
  // here is the exception, not the rule: it means the creator has switched
  // that one member's access off. The creator themself is never restricted
  // (enforced in reminder-groups.service.js, not here - no FK in this schema).
  `CREATE TABLE IF NOT EXISTS reminder_group_restrictions (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    group_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    restricted_by BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reminder_group_restriction (group_id, user_id),
    INDEX idx_reminder_group_restrictions_user (user_id)
  )`,

  // Append-only work-log for a group reminder - the reminder's own
  // description is written once at creation and never overwritten again;
  // every later progress note is a new row here, attributed + dated,
  // rather than silently replacing what was already written.
  `CREATE TABLE IF NOT EXISTS reminder_updates (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    reminder_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    note VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reminder_updates_reminder (reminder_id, id)
  )`,

  // Set when a reminder belongs to a reminder_groups row. Recipients are
  // then derived dynamically from reminder_group_members at notify time
  // (see reminders.scheduler.js) instead of reminder_recipients.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS group_id BIGINT NULL`,

  // Set when a reminder is a Project "Task" - delegated to exactly one
  // person via the existing generic reminder_recipients mechanism (clamped
  // to a single entry in reminders.service.js) rather than a whole Group.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS project_id BIGINT NULL`,

  // Whether the reminder's own owner wants to be alarmed too, not just any
  // recipients it was shared with (see reminder_recipients) - generic on
  // the table, same as recipient_mobile/wish_message, though today only
  // the Business Notes form (type='note') surfaces the toggle for it.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS self_reminder BOOLEAN NOT NULL DEFAULT TRUE`,

  // One row per user per day (see modules/user/fitness) - the "Add Fitness"
  // screen always submits the whole day's form at once, so a day is either
  // fully unlogged or has one full row, never several partial ones.
  // `exercises` is a JSON array of {name, durationMinutes, calories,
  // distanceKm} the same way reminders.checklist_items works above - not
  // every exercise reports the same metrics, so a rigid child table would
  // need most of its columns nullable anyway.
  `CREATE TABLE IF NOT EXISTS fitness_logs (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    user_id BIGINT NOT NULL,
    log_date DATE NOT NULL,
    mood ENUM('lazy','average','good','great','excellent') NULL,
    steps INT NULL,
    calories INT NULL,
    workout_minutes INT NULL,
    active_calories INT NULL,
    distance_km DECIMAL(6,2) NULL,
    floors_climbed INT NULL,
    weight_kg DECIMAL(5,2) NULL,
    body_fat_percent DECIMAL(4,1) NULL,
    water_intake_liters DECIMAL(4,2) NULL,
    sleep_hours DECIMAL(4,2) NULL,
    exercises JSON NULL,
    notes VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_fitness_logs_user_date (user_id, log_date)
  )`,

  // Personal "Family Sharing" (Home -> Business -> Family Sharing) - a
  // separate, simpler concept from reminder_groups above (which is scoped
  // under a Company -> Project and only has a binary can_manage/restricted
  // permission). A user creates at most one family group; members are
  // invited by mobile number (must already be a registered user - there's
  // no SMS/email delivery configured in this app to invite someone who
  // isn't) and are added directly rather than going through a pending-
  // accept step, same as reminder_group_members already works.
  `CREATE TABLE IF NOT EXISTS family_groups (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    name VARCHAR(100) NOT NULL DEFAULT 'My Family',
    created_by BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // permission is the ceiling on what this member can do with reminders
  // shared to them via the existing generic reminder_recipients mechanism -
  // 'view' (read only) < 'edit' (view+complete/edit) < 'add' (+ create new
  // shared reminders) < 'full' (also manage members/settings, same as the
  // creator). The creator is always inserted here too, with 'full'.
  `CREATE TABLE IF NOT EXISTS family_group_members (
    id BIGINT PRIMARY KEY AUTO_RANDOM,
    group_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    permission ENUM('view','edit','add','full') NOT NULL DEFAULT 'view',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_family_member (group_id, user_id),
    INDEX idx_family_members_user (user_id)
  )`,

  // Widen to cover the family-invite notification (already shipped using
  // 'family') and the new LifeMate Contacts "nudge" bell. MODIFY COLUMN is
  // safe to re-run as long as it's always a superset of whatever types
  // already exist in the data, same reasoning as the reminders.type widen
  // above.
  `ALTER TABLE notifications MODIFY COLUMN type ENUM('reminder','chat','system','family','nudge') NOT NULL DEFAULT 'system'`,

  // Which Android notification channel a user wants reminder pushes to
  // play. Either a bundled-sound id (src/utils/notifications.js's
  // SOUND_CATALOG - 'default', 'alert', 'bell', etc.) or a
  // "reminders-custom-<timestamp>" channel id for a sound the user picked
  // from their own phone (modules/reminder-sound) - that channel is created
  // on-device at pick time, this column just remembers which one to push
  // through.
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notification_sound VARCHAR(30) NOT NULL DEFAULT 'default'`,
  // Widened from 30 - "reminders-custom-" (17 chars) + a 13-digit ms
  // timestamp is already exactly 30, no room to spare for anything longer.
  `ALTER TABLE user_settings MODIFY COLUMN notification_sound VARCHAR(64) NOT NULL DEFAULT 'default'`,
];

const migrate = async () => {
  for (const statement of statements) {
    await pool.query(statement);
  }
  console.log(`Migration complete: ${statements.length} tables ensured.`);
  await pool.end();
};

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
