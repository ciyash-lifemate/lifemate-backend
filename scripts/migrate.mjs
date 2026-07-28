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

  // Widen the type enum for the "recharge" reminder type (mobile/DTH recharge
  // due-date reminders) - MODIFY COLUMN is safe to re-run.
  `ALTER TABLE reminders MODIFY COLUMN type
    ENUM('medicine','birthday','anniversary','note','task','custom','recharge') NOT NULL`,

  // Birthday/anniversary wish-sending: the due-reminder push carries these so
  // the app can open WhatsApp pre-filled with the chosen message for this
  // recipient - there's no way to auto-send through the real WhatsApp app
  // without the (paid, business-verified) WhatsApp Business Cloud API, so
  // this is a "one tap to send" flow, not a silent auto-send.
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS recipient_mobile VARCHAR(20) NULL`,
  `ALTER TABLE reminders ADD COLUMN IF NOT EXISTS wish_message VARCHAR(500) NULL`,

  // Widen the type enum for "Events / Meetings" (Quick Add on Home) -
  // same MODIFY COLUMN pattern used above for "recharge".
  `ALTER TABLE reminders MODIFY COLUMN type
    ENUM('medicine','birthday','anniversary','note','task','custom','recharge','event') NOT NULL`,

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

  // Widen the type enum for "Alarm" (Quick Add on Home) - same MODIFY
  // COLUMN pattern used above.
  `ALTER TABLE reminders MODIFY COLUMN type
    ENUM('medicine','birthday','anniversary','note','task','custom','recharge','event','alarm') NOT NULL`,

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
