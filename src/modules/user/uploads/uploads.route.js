import { Router } from 'express';
import { uploadChatFile } from './uploads.middleware.js';
import { uploadFile } from './uploads.controller.js';

const router = Router();

router.post('/', uploadChatFile, uploadFile);

export const uploadRoutes = router;
