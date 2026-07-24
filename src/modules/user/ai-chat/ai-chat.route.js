import { Router } from 'express';
import { validateSendAiMessage, validateListAiMessages } from './ai-chat.validation.js';
import { getMessages, sendMessage } from './ai-chat.controller.js';

const router = Router();

router.get('/messages', validateListAiMessages, getMessages);
router.post('/messages', validateSendAiMessage, sendMessage);

export const aiChatRoutes = router;
