import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../../../config/env.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_DOCUMENT_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'text/plain',
];

if (!fs.existsSync(env.upload.dir)) {
  fs.mkdirSync(env.upload.dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, env.upload.dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 20);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const isAllowed =
    ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix)) ||
    ALLOWED_DOCUMENT_MIMES.includes(file.mimetype);

  if (!isAllowed) {
    return cb(new ApiError(400, `Unsupported file type: ${file.mimetype}`));
  }
  cb(null, true);
};

export const uploadChatFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.upload.maxSizeMb * 1024 * 1024 },
}).single('file');
    