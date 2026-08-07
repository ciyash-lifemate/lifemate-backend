import { Router } from 'express';
import {
  validateCreateChat,
  validateSendMessage,
  validateEditMessage,
  validateListMessages,
  validateDeleteMessage,
  validatePinChat,
} from './chats.validation.js';
import {
  createChat,
  getChats,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markChatRead,
  clearChat,
  pinChat,
} from './chats.controller.js';

const router = Router();

router.get('/', getChats);
router.post('/', validateCreateChat, createChat);
router.get('/:chatId/messages', validateListMessages, getMessages);
router.post('/:chatId/messages', validateSendMessage, sendMessage);
router.patch('/:chatId/messages/:messageId', validateEditMessage, editMessage);
router.delete('/:chatId/messages/:messageId', validateDeleteMessage, deleteMessage);
router.patch('/:chatId/read', markChatRead);
router.delete('/:chatId/messages', clearChat);
router.patch('/:chatId/pin', validatePinChat, pinChat);

export const chatRoutes = router;
