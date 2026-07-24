import { env } from '../../../config/env.js';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

// Maps a stored file's mimetype to the chat message_type enum
// (see scripts/migrate.mjs) so the client knows how to render it.
export const messageTypeForMime = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
};

export const describeUploadedFile = (file) => {
  if (!file) throw new ApiError(400, 'No file uploaded');

  return {
    url: `${env.upload.publicBaseUrl}/uploads/${file.filename}`,
    name: file.originalname,
    size: file.size,
    mime: file.mimetype,
    type: messageTypeForMime(file.mimetype),
  };
};
