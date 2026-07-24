import { Router } from 'express';
import { getCallHistory } from './calls.controller.js';

const router = Router();

// Calls themselves are signaled over Socket.IO (see realtime/socket.js) -
// this is just the WhatsApp-style call log tab.
router.get('/', getCallHistory);

export const callRoutes = router;
