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

export const testConnection = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
    console.log('TiDB connection established');
  } finally {
    connection.release();
  }
};
