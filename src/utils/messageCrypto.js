// AES-256-GCM encryption for chat message content at rest.
//
// This is NOT end-to-end encryption: the server holds the key, so it can read
// every message. What it buys is that a leaked database dump (or a DB-level
// breach at the TiDB provider) is ciphertext rather than everyone's chat
// history. True E2EE needs per-device keypairs and is a separate, much larger
// piece of work - see the v2 roadmap.

import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM's standard nonce length
const TAG_BYTES = 16;
// Marks a value as produced by this module. Rows written before encryption
// existed have no prefix, so decrypt can tell them apart and pass them
// through instead of throwing on every old message.
const PREFIX = 'v1:';

const key = (() => {
  if (!env.chat.encryptionKey) return null;
  const buf = Buffer.from(env.chat.encryptionKey, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `CHAT_ENCRYPTION_KEY must decode to 32 bytes for aes-256-gcm, got ${buf.length}. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  return buf;
})();

export const isEncryptionEnabled = () => key !== null;

if (!key) {
  console.warn(
    '[chat] CHAT_ENCRYPTION_KEY is not set - message content will be stored in plaintext.'
  );
}

/** @param {string|null|undefined} plaintext @returns {string|null} */
export const encryptMessage = (plaintext) => {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  // iv | authTag | ciphertext - fixed-width header, so decrypt can slice it
  // back apart without a separate column or delimiter.
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
};

/** @param {string|null|undefined} stored @returns {string|null} */
export const decryptMessage = (stored) => {
  if (stored === null || stored === undefined) return null;
  if (!stored.startsWith(PREFIX)) return stored; // pre-encryption row

  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    // A wrong/rotated key or a corrupted row must not take down the whole
    // chat history load - the one unreadable bubble degrades on its own.
    console.error('[chat] Failed to decrypt a message:', err.message);
    return null;
  }
};

// Convenience for mapping DB rows on the way out.
export const decryptRow = (row) => (row ? { ...row, content: decryptMessage(row.content) } : row);
