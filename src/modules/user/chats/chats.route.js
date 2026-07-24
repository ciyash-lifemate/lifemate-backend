import { Router } from 'express';
import {
  validateCreateChat,
  validateSendMessage,
  validateEditMessage,
  validateListMessages,
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
  pinChat,
} from './chats.controller.js';

const router = Router();

router.get('/', getChats);
router.post('/', validateCreateChat, createChat);
router.get('/:chatId/messages', validateListMessages, getMessages);
router.post('/:chatId/messages', validateSendMessage, sendMessage);
router.patch('/:chatId/messages/:messageId', validateEditMessage, editMessage);
router.delete('/:chatId/messages/:messageId', deleteMessage);
router.patch('/:chatId/read', markChatRead);
router.patch('/:chatId/pin', validatePinChat, pinChat);

export const chatRoutes = router;
