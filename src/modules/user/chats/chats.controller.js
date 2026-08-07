const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, { statusCode = 200, message, data } = {}) => {
  res.status(statusCode).json({
    success: true,
    ...(message !== undefined && { message }),
    ...(data !== undefined && { data }),
  });
};
import * as chatsService from './chats.service.js';

export const createChat = asyncHandler(async (req, res) => {
  const chat = await chatsService.startChat(req.userId, req.body.userId);
  sendSuccess(res, { statusCode: 201, data: chat });
});

export const getChats = asyncHandler(async (req, res) => {
  const chats = await chatsService.listMyChats(req.userId);
  sendSuccess(res, { data: chats });
});

export const getMessages = asyncHandler(async (req, res) => {
  const messages = await chatsService.listMessages(req.params.chatId, req.userId, req.query);
  sendSuccess(res, { data: messages });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const message = await chatsService.sendMessage(req.params.chatId, req.userId, req.body);
  sendSuccess(res, { statusCode: 201, data: message });
});

export const editMessage = asyncHandler(async (req, res) => {
  const message = await chatsService.editMessage(
    req.params.chatId,
    req.params.messageId,
    req.userId,
    req.body.content
  );
  sendSuccess(res, { data: message });
});

export const deleteMessage = asyncHandler(async (req, res) => {
  await chatsService.deleteMessage(req.params.chatId, req.params.messageId, req.userId, {
    forEveryone: req.query.forEveryone,
  });
  sendSuccess(res, { message: 'Message deleted' });
});

export const markChatRead = asyncHandler(async (req, res) => {
  await chatsService.markRead(req.params.chatId, req.userId);
  sendSuccess(res, { message: 'Chat marked as read' });
});

export const clearChat = asyncHandler(async (req, res) => {
  await chatsService.clearChat(req.params.chatId, req.userId);
  sendSuccess(res, { message: 'Chat cleared' });
});

export const pinChat = asyncHandler(async (req, res) => {
  await chatsService.setPinned(req.params.chatId, req.userId, req.body.isPinned);
  sendSuccess(res, { message: 'Chat updated' });
});
