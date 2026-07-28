import { logger } from '../utils/logger.js';

const sendError = (res, { statusCode = 500, message } = {}) => {
  res.status(statusCode).json({ success: false, message });
};

// Friendly copy for the columns that carry a UNIQUE constraint (see
// scripts/migrate.mjs). Keyed by the column name MySQL/TiDB reports in
// "Duplicate entry '...' for key 'table.column'".
const DUPLICATE_FIELD_MESSAGES = {
  email: 'This email is already linked to another account.',
  mobile: 'This mobile number is already registered.',
  google_id: 'This Google account is already linked to another user.',
  uq_device_token: 'That device is already registered.',
};

// TiDB (unlike upstream MySQL) sometimes reports the offending value as a
// literal "?" instead of substituting it into the duplicate-key error text,
// so this only ever parses the key/column name, never the value.
const duplicateEntryMessage = (err) => {
  const match = /for key '(?:[\w-]+\.)?([\w-]+)'/.exec(err.sqlMessage || err.message || '');
  return DUPLICATE_FIELD_MESSAGES[match?.[1]] || 'That value is already in use.';
};

export const errorHandler = (err, req, res, next) => {
  // A raw driver error escaped a service without being wrapped in an
  // ApiError - never leak SQL/driver internals (error text, table/column
  // names, query fragments) to the client, only to the server log.
  if (err.name !== 'ApiError') {
    logger.error(err.message, { stack: err.stack, path: req.originalUrl, code: err.code });

    if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      return sendError(res, { statusCode: 409, message: duplicateEntryMessage(err) });
    }
    return sendError(res, { statusCode: 500, message: 'Internal server error' });
  }

  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    logger.error(err.message, { stack: err.stack, path: req.originalUrl });
  } else {
    logger.warn(err.message, { path: req.originalUrl, statusCode });
  }
  sendError(res, { statusCode, message: err.message || 'Internal server error' });
};
