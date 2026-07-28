import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { env } from './env.js';

const buildSslConfig = () => {
  if (!env.db.sslCaPath) return undefined;
  return {
    ca: fs.readFileSync(env.db.sslCaPath, 'utf8'),
    minVersion: 'TLSv1.2',
  };
};

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  ssl: buildSslConfig(),
  // mysql2 defaults to the connection charset 'UTF8_GENERAL_CI', which is
  // MySQL's old 3-byte utf8 - most emoji need 4 bytes and get silently
  // replaced with '?' on the way in without this, regardless of the table's
  // own charset (this is encoded client-side before the bytes are even sent).
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  // TiDB's AUTO_RANDOM PKs regularly exceed Number.MAX_SAFE_INTEGER; without
  // this, mysql2 silently rounds large BIGINTs into the wrong id.
  supportBigNumbers: true,
  bigNumberStrings: true,
  // Return DATE/DATETIME/TIMESTAMP as raw strings instead of JS Date objects,
  // so date-only fields aren't shifted by local timezone conversion.
  dateStrings: true,
});

// Without this, an 'error' event from an idle pooled connection (a dropped
// Wi-Fi network, a TiDB Cloud blip) is an unhandled EventEmitter error, which
// crashes the entire Node process - not just the query that was affected.
// mysql2 already reconnects/retries on the next query; this only needs to
// stop that from being fatal.
pool.on('error', (err) => {
  console.error('DB pool error (non-fatal, connection will be replaced):', err.message);
});

export const testConnection = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
    console.log('TiDB connection established');
  } finally {
    connection.release();
  }
};
