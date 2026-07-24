// Shared handle to the Socket.IO server so REST-side services (chats, calls)
// can push realtime events without importing socket.js directly and risking
// a circular import (socket.js registers handlers that call those services).

let ioInstance;

export const setIo = (io) => {
  ioInstance = io;
};

// Every authenticated socket joins a room named `user:<id>` (see socket.js),
// so emitting to that room reaches all of a user's devices at once.
export const emitToUser = (userId, event, payload) => {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
};
