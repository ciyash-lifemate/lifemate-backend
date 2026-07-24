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
import * as aiChatService from './ai-chat.service.js';

export const getMessages = asyncHandler(async (req, res) => {
  const messages = await aiChatService.listMessages(req.userId, req.query);
  sendSuccess(res, { data: messages });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const result = await aiChatService.sendMessage(req.userId, req.body.content);
  sendSuccess(res, { statusCode: 201, data: result });
});
