// Chat media is written to a local directory (see uploads.middleware.js).
// That works for local development and any host with a persistent disk, but
// NOT for an ephemeral filesystem like Render's default - every deploy wipes
// the folder and every previously sent photo 404s. Before going to production
// there, swap multer's diskStorage for an object store (Cloudflare R2 is the
// cheap option: no egress fees, which is what dominates chat media cost) and
// return its URL from describeUploadedFile below.

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
    // Relative by default, and deliberately so: an absolute URL baked in here
    // is wrong for every client that isn't on the same host as the server -
    // "localhost" on a phone means the phone. The app resolves this against
    // whatever API origin it is already talking to (see mobile
    // src/utils/chat.js resolveMediaUrl). Set UPLOAD_PUBLIC_BASE_URL only when
    // media is served from a different origin than the API, e.g. a CDN.
    url: env.upload.publicBaseUrl
      ? `${env.upload.publicBaseUrl}/uploads/${file.filename}`
      : `/uploads/${file.filename}`,
    name: file.originalname,
    size: file.size,
    mime: file.mimetype,
    type: messageTypeForMime(file.mimetype),
  };
};
