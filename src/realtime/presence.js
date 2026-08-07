// In-memory presence: which userIds currently have at least one open socket,
// and which socket ids belong to them (a user can have multiple devices).
// Single-process only - if this ever runs behind multiple Node instances,
// swap this Map for a shared store (e.g. Redis) keyed the same way.

const socketsByUser = new Map();

// Ids arrive both as JS numbers (JWT payloads) and as strings (mysql2 runs
// with bigNumberStrings, since TiDB AUTO_RANDOM ids exceed 2^53). Keying the
// Map on the string form keeps those two spellings of the same user together -
// otherwise a user looks offline to exactly the callers that matter.
const key = (userId) => String(userId);

export const addSocket = (userId, socketId) => {
  const set = socketsByUser.get(key(userId)) ?? new Set();
  set.add(socketId);
  socketsByUser.set(key(userId), set);
  return set.size === 1; // true if this is the user's first connection
};

export const removeSocket = (userId, socketId) => {
  const set = socketsByUser.get(key(userId));
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    socketsByUser.delete(key(userId));
    return true; // true if the user has no more open connections
  }
  return false;
};

export const isOnline = (userId) => socketsByUser.has(key(userId));
